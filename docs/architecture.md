# 架构说明

这个插件由两半组成：**宿主端**（`index.js`，Node，跑在 DSH 进程里）和**客户端**
（`client.js`，浏览器 bundle，跑在渲染进程里）。两者通过本机 HTTP 路由通信。

```
┌──────────────────────── DeepSeek Harness 进程 ────────────────────────┐
│                                                                       │
│  index.js（宿主插件）                                                  │
│   ├─ 监听 session/event  → turn/start、assistant/message、turn/end     │
│   ├─ 监听 llm/stream     → 记录首个输出 token 的时刻（思考耗时）        │
│   ├─ 缓存 deepseekAccount → 余额（TTL 60s）                            │
│   └─ 注册回环路由：/fatfish/stats、/fatfish/balance、/fatfish/hello     │
│                                                                       │
└───────────────────────────────▲───────────────────────────────────────┘
                                │ fetch（127.0.0.1）
┌───────────────────────────────┴───────────────────────────────────────┐
│  client.js（浏览器）                                                   │
│   ├─ 占用 shell.overlay            → 浮动桌宠 + 右下角立牌              │
│   ├─ 占用 sidebar.brand.mark       → 侧栏圆形头像                       │
│   ├─ 占用 conversation.hero.brand.mark → 新会话开屏立绘                 │
│   ├─ 占用 settings.general.item    → 设置里的主题开关                   │
│   └─ 注入一份 <style>             → 壁纸 / 液态玻璃 / 消息纯文字        │
└───────────────────────────────────────────────────────────────────────┘
```

## 客户端

### 为什么是单文件

DSH 的客户端模块表只解析**包根 specifier**，bundle 内部不能 `require` 自己包里的第二个
文件。所以所有图片都以 data URI 内联进 `client.js`，由 `tools/inline_sprites.py` 把
`__SPRITE_*__` 占位替换成 base64。

### 槽位

| 槽位 | id | 作用 |
| --- | --- | --- |
| `shell.overlay` | `dlaoshi-companion` | 浮动桌宠 + 右下角立牌（同一组件，保证一起出现） |
| `sidebar.brand.mark` | `dlaoshi-sidebar` | 侧栏品牌位置的圆形头像 |
| `conversation.hero.brand.mark` | `dlaoshi-hero` | 空白会话的开屏立绘 |
| `settings.general.item` | `dlaoshi-theme` | 设置 › 通用 里的主题开关行 |

桌宠与立牌刻意放在**同一个** occupant 里：浮动层是唯一被验证稳定渲染的位置，合在一起
就不会出现"桌宠在、立牌丢"的半残状态。

### 桌宠状态机

- **运行信号**：输入框里的停止按钮 **或** `[data-conversation-scroll]` 内文本增长
- **判定时机**：只在"运行 → 停止"的那一帧判定一次
- **结果**：本轮新增的状态标记 / 重试节点 / 报错提示 → 失望；否则 → 开心
- 判定后启动静默计时，到期回到默认表情；每次新事件都会重置计时器，避免上一轮计时串台

### 立牌

- 固定 `right:16px; bottom:14px`，**不可拖动**
- 宽度按窗口右侧实际可用边距计算（`clamp(84px, 9.2vw, 170px)`，运行时测量后内联覆盖），
  保证窗口化时自动变小、不会压到消息
- 每轮结束由宿主统计推送，弹出"本次消耗 token / 思考时间"气泡，12 秒后收起
- 点击：两套同名关键帧 `squish-a` / `squish-b` 交替 → 浏览器每次都会重新播放 q 弹
- 余额是**单独的**气泡，点击时才请求

### 皮肤

所有视觉覆盖都挂在 `html.dlao-skin-on` 之下：

```css
html.dlao-skin-on [data-conversation-content] { /* 壁纸 */ }
html.dlao-skin-on [data-composer-card]::before { /* 液态玻璃 */ }
html.dlao-skin-on [data-chat-flow-kind="user"] [class*="_bubble"] { /* 纯文字 */ }
```

开关就是切换这个 class。关掉即回到 DSH 原生界面，不残留任何规则。

几个踩过的坑：

1. **闪屏**：`backdrop-filter` 直接挂在输入框卡片上时，光标每 0.5 秒闪烁都会让浏览器
   重新采样背景 → 整屏闪。把模糊移到卡片的 `::before`（`z-index:-1` + `isolation:isolate`）
   后，光标在模糊层之上重绘，问题消失。
2. **点不动**：立牌是桌宠拖拽层的子节点，`pointerdown` 会被桌宠的
   `setPointerCapture` 吞掉 → 在图片上显式 `stopPropagation`。
3. **动画不重播**：只改 `animation-duration` 不会重启动画，必须换 `animation-name`。
4. **用户气泡**：用户消息的行元素不是气泡本体，真正的黑底在 `[class*="_bubble"]` 上，
   要覆盖的是气泡本身。

## 宿主端

### turn 统计

| 事件 | 用途 |
| --- | --- |
| `turn/start` | 重置计数、记录起始时间 |
| `assistant/message` | 累加 `data.usage`（provider 精确值） |
| `turn/end` | 冻结本轮总量，落 `reason` |
| `llm/stream` | 瀑布拦截，记录首个输出 token 的时刻 → 思考耗时 |

`/fatfish/stats` 返回 `{ ok, now, sessionId, stats, balance }`，其中 `balance` 来自
60 秒缓存，省掉每次轮询都读账户。

### 余额

宿主用 `ctx.inject(['deepseekAccount'])` **懒注入**官方能力，客户端点击立牌时打
`/fatfish/balance`。之所以不在客户端用 `ctx.remote.account`：声明一个不存在的
remote 会让整个插件停摆。

### 安全

所有路由先校验 `req.socket.remoteAddress` 是否回环地址，非本机请求返回 403。
插件不监听任何对外端口，不写文件，不发起外部网络请求。

## 测试策略

`test/` 下的四套测试都不需要浏览器：

| 文件 | 覆盖 |
| --- | --- |
| `verify_pet_outfit.cjs` | 解码 8 张内联图、槽位注册、皮肤 CSS、预览页生成 |
| `verify_pet_poke.cjs` | 点击换表情、拖拽位置持久化、立牌点击与气泡 |
| `verify_pet_states.cjs` | 21 条状态机断言（虚拟时钟驱动） |
| `verify_turn_stats.cjs` | 宿主统计、路由、缓存、回环限制 |

客户端测试用 `vm` 加载 `client.js`，伪造 `window.__ModuleLoader__`、`react`、
`document`、`localStorage` 和 `fetch`，然后直接调用真实 handler。

## 可以怎样扩展

- 换角色：替换 `assets/` 的 webp，跑 `tools/inline_sprites.py`
- 换台词：`client.js` 顶部的 `LINES` 常量
- 换配色：`TOKENS`（主题 token 覆盖）
- 加功能：新开一个槽位 occupant，或给宿主加一条 `/fatfish/*` 路由
