# Changelog

## 2.1.4 — 2026-10-22

按 DSH 的「可逆副作用」规范重写挂载流程，支持热重组。

- 所有副作用都成对：样式表、`html` 皮肤类、主题 token、槽位占用全部由 `ctx.effect` 托管，
  卸载时逐项回滚，不再依赖页面刷新
- 二次 `apply()` 幂等：先释放上一批槽位占用再挂载，避免热重组后出现两只桌宠
- 新增自愈：槽位容器还在、本插件节点消失时（HMR 驱逐），约 5 秒内自动重新挂载
- 测试新增「重复 apply 不重复占用槽位」断言

> 注意：全新安装插件仍需重启一次 Host——DSH 的插件图在启动时组合，这不是插件能绕过的。

## 2.1.3 — 2026-10-22

修复：网页端加载失败（`__ModuleLoader__` 未注册）。

- 客户端 bundle 注册的插件 id 从 `@local/dsh-fatfish-outfit` 改为 `dlaoshi-outfit`，
  与包名/加载器一致；此前网页端会报「导入失败：client-modules 未注册」。
- 主题 `overrideTokens` 与样式表标记同步改名。

## 2.1.1 — 2026-10-22

发布到 npm：`npm i dlaoshi-outfit` / `dsh plugin add dlaoshi-outfit`。

- 包名改为 `dlaoshi-outfit`，已发布到 npm 公共源
- `cordis.patch.yml` 插件名同步
- 市场描述关键词：鲸鱼正太、女仆装、二次元
- 安装文档改为「一条命令 / GitHub / 手动」三种方式

## 2.0.1 — 2026-10-22

文档与协作设施补全（无功能变更）。

- 新增 `CONTRIBUTING.md`、`SECURITY.md`
- 新增 Issue 模板（Bug 报告 / 功能请求）与 PR 模板
- README 增加 CI / License / 插件 / Release 徽章与发布包入口
- 首个 GitHub Release 与发布包 `dlaoshi-outfit-opensource.zip`

## 2.0.0 — 2026-10-22

第一个公开版本。

- **桌宠**：4 种表情、自由拖拽、位置记忆、点击切换、状态联动
- **右下角立牌**：每轮结束弹出 token 消耗与思考时间气泡；点击 q 弹 + 气泡膜音效 + 独立余额气泡
- **聊天皮肤**：背景壁纸、液态玻璃输入框；消息区改为纯文字（无玻璃、无黑色气泡）
- **设置开关**：设置 › 通用 里一键启用/禁用整套外观，状态持久化
- **宿主统计**：`session/event` + `llm/stream` 采集，`/fatfish/*` 回环路由
- **测试**：四套无浏览器行为测试 + GitHub Actions CI
- **工具**：抠图、壁纸生成、素材内联脚本

## 1.0.0

内部初版：桌宠形象替换、四表情、侧栏头像与开屏立绘。
