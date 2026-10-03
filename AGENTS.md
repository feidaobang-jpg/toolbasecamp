# toolbasecamp 项目规则（AGENTS.md）

本仓库的完整编码约定写在 `.cursor/rules/*.mdc`（25 条，其中 21 条 `alwaysApply: true`）。
**这些文件不会自动注入上下文，开工前必须主动读取：**

```bash
cat .cursor/rules/*.mdc        # 全量；或按下方索引只读与本次任务相关的文件
```

只在"随便看看/回答问题"类任务时可跳过；只要会改文件，就必须先读相关规则。

## 规则索引（.cursor/rules/）

流程与部署（几乎每次都适用）：`auto-commit-push`、`git-sync-before-work`、`verify-static-deploy`、`vps-ssh-ops`、`html-utf8-encoding`、`no-scratch-leftovers`、`windows-host`、`windows-log-utf8`

全站 UI 与文案：`no-tailwind`、`tool-ui-globals`、`i18n-bilingual`、`site-stats-zh-labels`、`list-pagination`、`no-sitewide-cache-bust`、`shared-js-helpers`、`timezone-utc-cn`

图像与生成类：`image-upload-compress`、`input-image-square`、`result-image-gallery`、`i2i-keep-aspect`、`wechat-image-download`、`tool-hub-badges`

服务端与设备：`comfyui-api-restart`、`home-pc-admin-ui`、`home-pc-media-pipeline`

## 提交与部署：必须走完的闭环

以下为流程规则的要点摘要；与 `.mdc` 原文冲突时以原文为准。规则声明的优先级高于"未明确要求不要提交"这类默认习惯。

1. **开工前**（`git-sync-before-work`）：工作区干净则 `git pull --ff-only`；有本地未提交改动时不拉，先汇报。
2. **改完 tracked 文件后**（`auto-commit-push`）：自动 `git add` + `commit` + `git push origin HEAD`，不要等用户提醒。提交说明用简体中文、简短祈使句并说明"为什么"；普通 commit，不 `--amend`；不提交 `.env`/密钥。仅当用户明确说"不要 commit / no push / 只改不提交"或处于只读模式时跳过。
3. **动了 `public/**` 时**（`verify-static-deploy`）：push 成功 ≠ 线上已更新。必须 curl 抽查 `https://www.zhengxiaohui.cn/<对应路径>` 是否含新文案（例如 `/js/locales/zh-CN.js`）。约 2–3 分钟仍未生效 → 判定部署未落地，自己 SSH 补同步：先 `scp` 到 `toolbasecamp-cn:~/sync-static/`，再 `ssh toolbasecamp-cn "sudo install -o lighthouse -g ubuntu -m 644 ~/sync-static/<file> /var/www/toolbasecamp/<dir>/"`，最后再次抽查确认。禁止用"等 Actions / 你清下缓存"代替校验。
4. **动了 `comfyui-api-server/` 时**（`comfyui-api-restart`）：push 后本机能重启就自动重启该 API。
5. **VPS 运维类改动**（`vps-ssh-ops`）：由 Agent 直接 SSH 执行，不把操作甩给用户。

Git 安全底线仍然有效：不改 `git config`，不 force push `master`，不 `--no-verify`（除非用户明确要求）。

## 网站游戏自动同步 Toy（用户长期授权，2026-10-04）

用户已明确要求：修改网站游戏后自动同步对应 Toy，不再等待逐次确认。本规则替代旧的“每次预览后再询问是否提交审核”约定。

- 对已有明确 Toy ID 映射的游戏，玩法、内容、操作、画面或玩家会遇到的 Bug 修复完成并验证网站部署后，按 `C:/Users/37818/.claude/skills/toy/SKILL.md` 自动打包、自检、生成预览并实测，随后以相同且已验证的包调用 `toy update <id> <path> --json --yes` 提交审核。保留原 ID、slug、可见性与视频绑定，不再询问“是否同步/提交”。
- 连续小修复合并为一次完整更新；记录包哈希、预览链接、提交时间、版本与平台返回状态。已提交的同一包不重复送审；提交结果不明时先查询记录和平台状态，不盲目重试。
- 仅改网站列表卡片、文档、视频素材或内部测试脚本时不触发。没有明确对应 Toy 时不擅自创建作品；预检/实测失败、登录失效或目标映射不明时先处理问题，需要用户介入才说明阻塞。
- 用户本次明确说“只改网站”“不要同步 Toy”“先预览”或“不要提交”时遵从。此授权不涵盖新建 Toy、改变可见性、绑定视频、发布视频或删除作品。
- 提交审核不等于上线；如实区分 `auditing` 与 `published`。这是修改任务的自动收尾流程，不是后台文件监控或定时任务。
