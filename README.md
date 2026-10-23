# 小D桌宠 · `dsh-xiaod-pet` · DeepSeek Harness 插件

一只可以**拖到任意位置**的桌宠：**二次元的鲸鱼正太**，穿着**女仆装**，外加右下角**立牌**、
聊天区**背景壁纸**、**液态玻璃**输入框与一组深海蓝配色。全部功能打包成一个零依赖的 DSH 插件。

> 搜索 **`dsh-xiaod-pet`** 或 **`dsh xiaod pet`** 都能找到本插件。
>
> 一个插件、一个开关：不想要的时候滑一下，DSH 立刻回到原样。

[![test](https://github.com/use3346631993/dsh-xiaod-pet/actions/workflows/ci.yml/badge.svg)](https://github.com/use3346631993/dsh-xiaod-pet/actions/workflows/ci.yml)
[![license: 仅限非商业](https://img.shields.io/badge/license-%E4%BB%85%E9%99%90%E9%9D%9E%E5%95%86%E4%B8%9A-red.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-xiaod-pet.svg)](https://www.npmjs.com/package/dsh-xiaod-pet)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-1E4D8F.svg)](https://github.com/use3346631993/dsh-xiaod-pet)
[![release](https://img.shields.io/badge/release-v2.1.0-2F55E0.svg)](https://github.com/use3346631993/dsh-xiaod-pet/releases/latest)

> **不想看源码？** 一条命令搞定：`dsh plugin add dsh-xiaod-pet`

![预览](docs/preview.jpg)

![预览](docs/preview.jpg)

## 功能

| 功能 | 说明 |
| --- | --- |
| 🐟 浮动桌宠 | 4 种表情（默认 / 开心 / 思考 / 失望），可自由拖拽，位置会记住 |
| 🎯 状态联动 | 自动跟随对话：流式输出时进入思考态，成功转开心，报错转失望 |
| 🖱️ 点击互动 | 单击切换表情（会自己回到默认），带语音气泡与"别戳啦"等台词 |
| 🪧 右下角立牌 | 常驻右下角，每轮结束弹出气泡：**本次 token 消耗**、**思考时间** |
| 🫧 点击立牌 | q 弹回弹 + 气泡膜"啵"声 + 单独一个余额气泡（读取官方 `deepseekAccount`） |
| 🖼️ 聊天背景 | 用你自己的插画做会话区壁纸，主题自适应蒙版保证可读性 |
| 🧊 液态玻璃 | 输入框磨砂玻璃 + 高光描边（不再有黑气泡，消息为纯文字） |
| 🗣️ 称呼与语气 | 设置 › 通用 里设置它怎么称呼你（默认「主人」），只改措辞不改回答方式 |
| ⚙️ 主题开关 | 设置 › 通用 里的滑动开关：一键启用 / 禁用整套外观 |

## 安装

前置：已安装 **DeepSeek Harness（桌面版）**，并至少启动过一次（生成了 profile）。

### 方式 A：一条命令（推荐）

```powershell
dsh plugin add dsh-xiaod-pet
```

或者在 DSH 里打开 **设置 → 插件 → 添加插件**，填：

```
dsh-xiaod-pet
```

装完**完全退出并重启** DSH。

### 方式 B：从 GitHub 装

```
https://github.com/use3346631993/dsh-xiaod-pet.git
```

### 方式 C：手动（离线 / 网络不好时）

1. 把本仓库复制到 profile 的 `node_modules\dsh-xiaod-pet`：

```powershell
git clone https://github.com/use3346631993/dsh-xiaod-pet.git C:\Users\你\Documents\dsh-xiaod-pet
mkdir "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-xiaod-pet" -Force
Copy-Item "C:\Users\你\Documents\dsh-xiaod-pet\*" `
  "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-xiaod-pet" -Recurse -Force
```

2. 编辑 `%USERPROFILE%\.dsh\profiles\desktop\package.json`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-xiaod-pet"
      ]
    }
  },
  "dependencies": {
    "dsh-xiaod-pet": "file:C:/Users/你/Documents/dsh-xiaod-pet"
  }
}
```

> 完整示例见 [`examples/profile.package.json`](examples/profile.package.json)。

3. 重启 DSH。右下角出现桌宠即安装成功。

## 使用

- **拖动**：按住桌宠拖到任意位置，松手即停留，下次启动还在原地
- **点击桌宠**：依次切换 开心 → 思考 → 失望 → 默认，几秒无操作自动回默认
- **点击右下角立牌**：q 弹一下、响一声气泡膜"啵"、弹出余额气泡
- **主题开关**：设置 › 通用 › 「小D」主题

  ![设置里的主题开关](docs/settings.png)

  - **开**：壁纸 + 液态玻璃 + 桌宠 + 立牌 + 侧栏头像
  - **关**：以上全部隐藏，恢复 DSH 原始界面（开关状态会记住）

## 称呼与语气

设置 › 通用 › **「小D」怎么称呼你**：

- 输入框里填称呼，默认 **主人**
- 左侧开关 = 启用 / 关闭称呼
- 右侧开关 = 是否允许偶尔加句末语气词（呀 / 呢 / 哦 / 啦）

实现方式：宿主用官方 `ctx.systemPrompt.section('dlaoshi:address')` 注入一段规则，段落文本是函数，
改完设置**下一个模型步骤就生效**。提示词里明确写了：

> 只改变称呼和语气词：回答的事实、结论、结构、代码、工具调用、专业程度与长度都保持原样。

所以它不会改变回答习惯，只是称呼与措辞更亲近。设置保存在
`~/.dsh/fatfish-outfit/persona.json`，重启后保持。

## 兼容性

- 只依赖 DSH 自带的 Client 运行时与官方 `deepseekAccount` 能力，**无第三方依赖**
- 客户端 bundle 单文件自包含：所有图片内联为 data URI，不需要联网加载素材
- 宿主路由仅监听 **回环地址**（`127.0.0.1`），不对外暴露
- 余额只在点击立牌时读取，结果缓存 60 秒
- 若 DSH 版本较旧、没有 `settings.general.item` 槽位：开关不显示，其余功能照常

## 目录结构

```
.
├── client.js              # 浏览器端：桌宠 + 立牌 + 主题皮肤 + 设置开关
├── index.js               # 宿主端：turn 统计 + /fatfish/* 路由
├── package.json           # 插件清单
├── cordis.patch.yml       # bundle patch，让 DSH 自动挂载
├── assets/                # 原始立绘（运行时不需要，改素材用）
├── tools/                 # 抠图 / 生成壁纸 / 内联素材脚本
├── test/                  # 无浏览器行为的 Node 测试
├── docs/                  # 截图与技术说明
└── examples/              # profile 配置示例
```

## 常见问题

### 装完之后没反应 / 第一次启动不生效

**这是 DSH 的加载机制，不是插件的问题。** 本插件已按「可逆副作用」实现：卸载即回滚、重复挂载不会叠加、被 HMR 驱逐后会自动重挂，但**全新安装仍需重启一次 Host**（插件图只在启动时组合）。 DSH 的插件图（loader entries）在 **Host 启动时组合**；热更新只对已经加载过的客户端 bundle 生效。全新安装一个插件等于往插件图里加一个新 entry，**必须完整重启一次 DSH** 才会生效。

排查顺序：

1. 完全退出 DSH（不是关窗口，要从托盘/任务管理器退出）
2. 重新启动
3. 设置 → 插件，确认 `dsh-xiaod-pet` 存在且已启用
4. 仍不出现 → 再重启一次（首次安装有时需要两轮：第一轮装包、第二轮组合）
5. 打开浏览器控制台（F12），看有没有 `__ModuleLoader__` 相关报错

### 桌宠突然消失

通常是客户端热更新（HMR）把插件卸载后没有重新挂载。按 `Ctrl+R` 刷新页面即可；刷新后仍不在就重启 DSH。

### 网页端提示「加载插件失败 / 未注册」

确认安装的是 **2.1.3 或更高版本**。`2.1.0` 和 `2.1.1` 的客户端注册 id 与包名不一致，已被标记 deprecated：

```powershell
dsh plugin add dsh-xiaod-pet@2.1.3
```

### 开发时想热更新

客户端代码改动只有在 `pnpm run dev:web` 同时运行时才会自动重建并热替换；否则改完 `client.js` 需要重启 DSH。

## 开发

```powershell
npm run check   # 语法检查
npm test        # 四套行为测试（表情循环 / 状态机 / 立牌气泡 / 宿主统计）
```

测试不依赖浏览器：它们用假的 DOM、假的 `React`、虚拟时钟和假的 Cordis 上下文，
直接驱动真实的 handler 与宿主逻辑。

### 更换素材

```powershell
# 1) 从插画里抠出立牌（透明背景）
python tools/cut_portrait.py path/to/your-art.png
# 2) 生成 1600px 宽的聊天壁纸
python tools/make_wallpaper.py path/to/your-art.png
# 3) 重新内联进 client.js（会改写 client.js 里的 __SPRITE_*__ 占位）
python tools/inline_sprites.py
```

依赖：Python 3 + Pillow + numpy。

## 技术要点

详见 [`docs/architecture.md`](docs/architecture.md)。

- **单文件客户端**：DSH 的模块表只解析包根 specifier，所以图片必须内联
- **不抢事件**：立牌是桌宠拖拽层的子节点，指针事件显式拦截，点击不会被拖拽吞掉
- **动画可重播**：q 弹用两套同名不同名的 keyframes 交替，保证每次点击都从头播
- **玻璃不闪屏**：`backdrop-filter` 放在 `::before` 图层，光标闪烁不再触发背景重采样
- **开关可回退**：所有皮肤规则挂在 `html.dlao-skin-on` 下，关掉即恢复原生界面

## 许可

**仅供个人、娱乐、学习使用，禁止商用。**

- ✅ 可以：自己安装使用、阅读源码学习、非商业分享（保留作者署名与项目链接）
- ❌ 不可以：销售、付费下载、订阅制、商业产品集成、拿角色素材商用

完整条款见 [`LICENSE`](LICENSE)；素材与第三方说明见 [`NOTICE`](NOTICE)。

## 作者

- 咪咪joy
- 抖音：1856306425
- 哔哩哔哩：一等分萝卜（UID 1957101674）
- 项目：https://github.com/use3346631993/dsh-xiaod-pet

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai) 的插件体系与官方 `deepseekAccount` 能力
- 灵感来自各类「桌面宠物 + 状态气泡」实现
