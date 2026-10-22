# Changelog

## 2.1.0 — 2026-10-22

发布到 npm，安装只需一行。

- 包名从 `@local/dsh-fatfish-outfit` 改为 **`dlaoshi-outfit`**（可在 npm 与 DSH 插件市场搜索安装）
- `cordis.patch.yml` 的插件名同步为 `dlaoshi-outfit`
- `package.json` 增加 `files` 白名单与 `publishConfig`，npm 包只带运行必需文件
- README 安装章节改为「一条命令 / GitHub / 手动」三种方式
- 市场描述关键词调整为：鲸鱼正太、女仆装、二次元

> 从 `@local/...` 升级的用户：先卸载旧条目（`dsh plugin remove @local/dsh-fatfish-outfit`），再装 `dlaoshi-outfit`。

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
