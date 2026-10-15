# toolbasecamp 项目规则

## 执行方式（用户2026-10-15）

默认只实现需求、必要构建和交付，以最低额度和最快速度为先；试玩由用户完成。不自行加测试或回归、自动通关、性能测量、多视口走查、验收截图录像、证据文件、release/handoff/QA 台账，也不例行扫描清理全仓库。已有脚本和历史记录保留备用，不作为交付门槛。用户点名验证时只做对应范围；解决明确报错可选用更省时的单个现成诊断工具，不扩成测试项目。

只读本次相关规则和代码，不全量读取 `.cursor/rules/*`、所有技能参考或历史 release。不额外启动子代理、制作候选方案或开展运营。游戏与视频所需的制作、录制、渲染、构建和打包属于需求本身；文档修改不启动游戏或构建游戏包。不把构建成功说成已试玩验证。

## 发布权限

- **用户 2026-10-15 最新指示：以后不需要他批准，全自动做。** 本地做完的新游戏 / 新关卡 / 新玩法直接发布网站和 Toy，下载所需素材、改旧视频简介、做新视频并上传 B站都直接办，做完在答复里汇报；只有登录失效、额度不足、平台拒绝或需求矛盾等真正卡住时才问。本条替代下面“说‘发布/上线’后才推”“成片由用户审片”“旧简介仅在用户要求时改”等需要等待批准的说法；付费、填密码证件、强推等硬底线不变。
- 新游戏、新关卡、新模式及同一轮本地迭代：交付本地可玩入口，用户对当前版本明确说“发布/上线”后才推生产主线、部署网站和提交 Toy；“可以了/验证通过”不自动等于发布。等待期间保留试玩入口与成果。
- 独立维护已上线版本的普通功能和 Bug，且不夹带待发布新内容：沿用自动提交、网站与已有 Toy 更新授权；当次“先预览/不要提交/只改网站”等限制优先。
- 新视频只做 B站版，成片由用户审片，获准后上传；制作本身不授权上传。TapTap 仅当次点名才办理。无定时任务，不主动接管其他工作。
- 活动、流量券、推流申请、数据复盘改为用户点名才做。旧简介仅在用户要求或现有说明明显错误时修改；不累计版本或维护待合并台账。玩家反馈只有用户指示后才修复或回复。

具体发布操作需要时读 `.cursor/rules/game-release-cadence.mdc`；共用权限源是本机 `C:/Users/37818/.claude/skills/game-maker/references/release-policy.md`，不另写一套发布条件。

## 工作区与交付

只改、暂存和提交本任务路径。单任务且目录干净时就地修改；存在其他任务改动、已知并行占用或分叉时，从最新远端另建独立分支/worktree，同任务复用；Codex 分支用 `codex/`。不改原目录分支，不覆盖、清理或夹带他人现场。不强推、不跳过 hook、不改 Git 配置、不提交凭据。

已获发布授权的改动按 `auto-commit-push.mdc` 正常整合主线并推送。仅文档/规则照常提交推送，不发游戏包。实际发布结果在最终答复说明，使用平台自带回执/历史去重，不另造手工台账。自己启动的录屏、无用页面和收费算力用完即停；用户仍需试玩的服务保留。

## 按任务读取

- 游戏功能和交互：`game-products.mdc` 中对应游戏/行为；存档与导航：`game-privacy.mdc`。产品约束继续有效，但不附带验收流程。
- Git 与部署：`git-sync-before-work`、`auto-commit-push`；改了 `public/**` 并发布才读 `verify-static-deploy`；API 改动读 `comfyui-api-restart`，VPS 操作读 `vps-ssh-ops`。
- 网站 UI：按改动选 `no-tailwind`、`tool-ui-globals`、`i18n-bilingual`、`site-stats-zh-labels`、`list-pagination`、`no-sitewide-cache-bust`、`shared-js-helpers`、`timezone-utc-cn`。
- 图片：按改动选 `image-upload-compress`、`input-image-square`、`result-image-gallery`、`i2i-keep-aspect`、`wechat-image-download`、`tool-hub-badges`。
- Windows/编码：`windows-host`、`windows-log-utf8`、`html-utf8-encoding`；本机媒体：`home-pc-media-pipeline`、`home-pc-admin-ui`。不恢复已移除的本机视频生成模块。

文件均在 `.cursor/rules/`。本机自定义技能统一位于 `C:/Users/37818/.claude/skills/`；工具内置技能路径不变。飞书按全局通知偏好执行，不把通知扩展成状态台账或后台监控。
