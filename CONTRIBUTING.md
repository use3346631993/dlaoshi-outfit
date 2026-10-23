# 贡献指南

感谢你想参与「D老师」桌宠插件！

## 提交问题

- **Bug**：请用 [Bug 报告](https://github.com/use3346631993/dsh-xiaod-pet/issues/new?template=bug_report.yml) 模板，附上 DSH 版本、系统版本、复现步骤和相关日志
- **功能建议**：用 [功能请求](https://github.com/use3346631993/dsh-xiaod-pet/issues/new?template=feature_request.yml) 模板，说明使用场景比描述实现更有用
- **安全相关**：请不要开公开 issue，见 [SECURITY.md](SECURITY.md)

## 本地开发

```powershell
git clone https://github.com/use3346631993/dsh-xiaod-pet.git
cd dsh-xiaod-pet
npm run check   # 语法检查
npm test        # 四套行为测试，全部无浏览器
```

测试必须全绿才能提 PR。四套测试分别覆盖：

| 文件 | 覆盖内容 |
| --- | --- |
| `test/verify_pet_outfit.cjs` | 内联素材、槽位注册、皮肤 CSS、预览生成 |
| `test/verify_pet_poke.cjs` | 点击换表情、拖拽持久化、立牌点击 |
| `test/verify_pet_states.cjs` | 状态机（21 条断言） |
| `test/verify_turn_stats.cjs` | 宿主统计、路由、缓存、回环限制 |

## 改代码时请注意

1. **`client.js` 是单文件 bundle**：不能 `require` 包内其它文件（DSH 模块表只解析包根 specifier）。图片必须内联，改完素材记得跑 `python tools/inline_sprites.py`。
2. **不要改槽位 id**：`dlaoshi-companion` / `dlaoshi-sidebar` / `dlaoshi-hero` / `dlaoshi-theme` 是和已发布版本共用的身份，改名会让老版本残留。
3. **皮肤规则一律挂在 `html.dlao-skin-on` 下**：这样设置里的开关关掉就能干净地回到原生界面。
4. **宿主路由只监听回环地址**：任何新路由都要沿用 `isLoopback` 校验。
5. **不要在日志或提交里写入账号、token、余额等隐私数据**。

## 提交 PR

- 一个 PR 只做一件事，标题用 `feat:` / `fix:` / `docs:` / `chore:` 开头
- 说明里写清楚「为什么改」和「怎么验证的」
- 涉及界面的改动请附截图（深色 + 浅色主题各一张更好）
- 不要提交 `test/pet_preview.html`（已在 `.gitignore`）

## 素材与授权

`assets/` 下的角色立绘**不属于任何开源授权（仅限非商业使用）**，见 [NOTICE](NOTICE)。如果你要提交新的角色形象，请确认你有权分发，并在 PR 说明里标注来源与授权。
