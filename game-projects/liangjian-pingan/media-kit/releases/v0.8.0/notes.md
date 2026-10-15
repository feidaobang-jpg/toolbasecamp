# 亮剑战役页 v0.8.0（枪火集结 0.5.0）：电脑键位 v2

- 电脑端：鼠标接管（被拒绝时按住拖动），左键开火、右键或 Z 开镜、按住 Shift 往前跑、空格跳、R 换弹、G 手榴弹、F 互动、Q 亮剑、E 骑兵连、V 切换人称；键盘转视角（Q/E、Y/H）取消，C 暂时不做事（下一批是蹲下）。
- 旧键 J/K/U/I/L/N/O 仍作不显示的别名；以前来过的玩家第一次开局提示一次新键位（`lj_campaign_v1_keys2`）。
- 跑步：只往前（含斜前），约走路 1.45 倍；按住开火先停跑开枪，开镜、换弹时跑不起来。
- 验收脚本跟着改：`views.cjs` 用鼠标位移代替键盘转视角，新增 V 切换、C 不再切换、Shift 跑四项；`interact.cjs` 改用 F/G/Q/E 并检查旧键别名与键位表 v2；剧情与场景脚本改按新键。结果：views 82/82、interact 19/19、story 19/19、cy-story 26/26、ljp-story 40/40、options 43/43、mobile 107/107、gunfire-chapters 10/10，三章机器人通关通过。
- 完整记录：`game-projects/starship-defense/media-kit/releases/web-keys-v2/notes.md`。
