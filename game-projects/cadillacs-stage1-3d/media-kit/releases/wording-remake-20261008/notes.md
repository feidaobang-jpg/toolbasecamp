# wording-remake-20261008 — 恐龙快打「3D 重置版」统一改称「3D 重制版」

- 改动：`index.html` 的 `<title>`、meta 描述、主菜单小标题「CAPCOM 1993 街机经典 · 3D 重制版」与版权说明「粉丝向非官方重制」；网站卡片简介（`public/js/locales/zh-CN.js` 的 `tools.cadillacs3d.desc`）；README、package.json、game.json 的 name/ip_note、overview 标题；CSS 注释。
- 分类：普通补丁（纯文案）。不改玩法、`js/game.min.js`、网址、存档标识、Toy ID/slug 与视频绑定。
- 原因：本作是从零重新制作的非官方 3D 重制（Remake），不是原样搬运的「复刻」，也不是在原素材上升级的「高清重置」；「重置」字面为 reset，统一为通行叫法「重制」。
- 渠道：网站随本提交部署并公网核验；Toy/TapTap 纯文案不单独送审，记为待合并，下次本游戏有更新时一并打包（读取 `media-kit/game.json` 的 `pending_channel_changes`）。已发 B 站视频标题、简介和历史发布记录保留原文，不改。
