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

## 游戏更新自动同步B站视频说明（用户长期授权，2026-10-04）

游戏代码更新完成并验证部署后，无论是否显式调用game-maker，都读取并执行 `C:/Users/37818/.claude/skills/bili-game-update/SKILL.md`，自动把已验证的玩家可见改动同步到本人同一游戏已确认的新旧B站视频简介，必要时维护更新评论，不再只交草稿或等待提醒。一批完成的改动同步一次，保留原介绍、历史成片、BV和其他元信息；不自动替换或重传视频。记录版本、BV、旧/新文案、提交与公开核验状态，先查重再更新。纯内部修改只记本地，无对应视频则记录待关联；登录/映射/平台阻塞如实报告。新成片发布仍按game-video审片流程。当次不同步/仅草稿等指令优先。这是任务收尾流程，不是后台文件监控。

## B站游戏内容增长方向（2026-10-04）

用户希望向高播放量和长期百万粉丝游戏创作者方向发展。后续视频策划按以下方向执行，播放量与粉丝目标不作为效果承诺：

- 定位围绕“把有趣的点子和玩家建议做成能玩的游戏”。以虫潮为近期主线，同时保留赤色要塞等新玩法实验；比例根据同窗口数据调整，不把账号锁死为单一游戏更新公告。
- 一期围绕一个玩家挑战、可见变化或真实开发取舍。开头兑现标题看点，减少操作清单、重复基础介绍、长静态尾卡；保留完整结果、简短下一步和必要试玩/投票引导，不为压时长截断收尾。
- 功能小修默认合并，不因每次代码提交单独制作视频。新游戏先验证一句话看点和真实实机，再决定是否立项做视频；新成片仍遵守game-video人工审片发布流程。
- 虫潮已建立B站“系列·虫潮围城开发实录”：https://space.bilibili.com/16214353/lists/5178167?type=series 。已收录BV1Ujad6DEuf、BV1WbHq6eEBt，关键词“虫潮”用于新投稿自动收录；后续虫潮视频标题保留准确游戏名，发布后核验归入。此为“系列”，不是已开通正式“合集”；当次正式合集入口提示需权益中心Lv2。
- 愿望榜区分接口source=seed（预置灵感）与source=user（用户提交）；票数另计，不把预置选项称为网友提出。当前voters按device_id去重，不能当作实名独立玩家数。票数作为选题线索，结合成本、实际试玩和反馈决定优先级，不承诺最高票必做。
- 复盘使用发布后24小时、72小时、7天的相同观察窗口，分别记录播放、留存、转粉、有效玩家反馈及Toy申请/运营反馈。后台暂无数据保留为空；不将账号总涨粉归因于单条视频，不把兴趣标签或参加活动等同已获推流，不凭一次高播放宣称稳定起号。
- 不为增长自动刷量、付费推广、批量重发旧片或联系他人；本条是后续执行任务的制作方向，不是后台运营或自动定时发片服务。
