# B站简介去掉制作脚注（2026-10-14）

用户要求公开简介不再写：版本/分段补拍/无限命·非一命、原声句数与戴耳机建议、Claude/IndexTTS/封面构图等制作脚注；技能同步改为「看点 + 试玩 + 压缩操作 + 投票」。

## 额外调整

- 整段键位表压成一两行操作说明
- 卖点可保留「喊话多为《亮剑》原声」（不是句数/耳机脚注）
- 去掉「正常规则通关」类录制条件
- 标签仍可打 Claude / AI；公开简介默认不写模型名
- `release-policy` 补一条公开简介禁制作脚注

## 结果

- 技能：`game-video` / `bili-game-update` / delivery 等参考已写明；`release-policy` 已补禁令
- 本人已映射 18 条游戏视频公开简介复查：`live_rescan_utf8.json` dirty=0（2026-10-14 晚）
- 样例：`BV12ypy68EZz_live.txt`、`BV1Lfp76KEDd_live.txt`
- 本地投稿草稿清理 21 份：`local_draft_clean_report.json`（简介正文去脚注；标签未动）