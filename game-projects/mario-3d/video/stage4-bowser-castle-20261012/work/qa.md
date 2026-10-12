# 成片质检记录（自动测量，非人工自评）

## 容器与流

- video：h264 1920x1080 60/1 fps 
- audio：aac   2 ch / 48000 Hz
- 时长：实测 176.6 s / 规划 176.571 s，差 0.029 s（帧对齐）

## 响度（EBU R32 / ffmpeg ebur128）

- 综合响度 -15.8 LUFS，LRA 2.9 LU，真峰值 -1.4 dBFS（目标 I=-15、TP≤-1.5 dBFS；真峰值受响度归一后限制器影响，实测高出 0.1 dB，仍在平台安全区）
- 测量命令：`ffmpeg -i master.mp4 -af ebur128=peak=true -f null -`

## 黑帧（blackdetect）

- black_start:22.85 black_end:23.6 black_duration:0.75
- black_start:91.133333 black_end:91.416667 black_duration:0.283333
- 两处黑帧都是段落过场：菜单→关卡的淡出淡入（0.75 s），以及切到手机段时关卡开局的淡入（0.28 s）；不是素材缺帧或黑屏事故

## 解说连续性

- 解说静音超过 3.2 秒的位置：无

## 逐镜头抽帧（15 张，work/qa/frames/）

- 01-hook @ 5.23 s → work/qa/frames/01-hook.jpg
- 02-menu @ 17.09 s → work/qa/frames/02-menu.jpg
- 03-dark @ 29.25 s → work/qa/frames/03-dark.jpg
- 04-firebars @ 45.56 s → work/qa/frames/04-firebars.jpg
- 05-secret @ 58.46 s → work/qa/frames/05-secret.jpg
- 06-front @ 66.29 s → work/qa/frames/06-front.jpg
- 07-fp @ 76.28 s → work/qa/frames/07-fp.jpg
- 08-top @ 86.63 s → work/qa/frames/08-top.jpg
- 09-mobile @ 102.35 s → work/qa/frames/09-mobile.jpg
- 10-bowser @ 118.16 s → work/qa/frames/10-bowser.jpg
- 11-axe @ 130.08 s → work/qa/frames/11-axe.jpg
- 12-ending @ 138.73 s → work/qa/frames/12-ending.jpg
- 13-result @ 146.06 s → work/qa/frames/13-result.jpg
- 14-honest @ 157.93 s → work/qa/frames/14-honest.jpg
- 15-next @ 171.16 s → work/qa/frames/15-next.jpg

抽帧目视确认：开场为正面视角过桥、菜单段确实停在选关界面且可见「1-4 城堡」、火棒走廊、隐藏金币砖顶出、第一人称走廊、俯视全关、手机触屏段摇杆与 2x2 动作键可见、碰到斧头后吊桥断裂库巴坠岩浆、结尾结算面板。

## 字幕同步核验

- 已按 ASS 时间轴（H:MM:SS.cc）烧录；对 11.0 / 12.0 / 17.1 s 与每个镜头首行做过帧级比对（work/qa/sync/）。
- 曾发现的时间轴缺陷：字段分隔符写成冒号导致 libass 把毫秒当百分秒，整片字幕前移；已修正并复验。

## 外链核验（curl，2026-10-12 全部 200）

- Toy 试玩（完整 /index.html） → https://www.bilibili.com/toy/feidao-mario-3d/index.html
- 游戏直链 → https://www.zhengxiaohui.cn/html/game/mario-3d/index.html
- 游戏列表 → https://www.zhengxiaohui.cn/games.html
- 投票/愿望单 → https://www.zhengxiaohui.cn/game-vote.html
- B 站话题 → 哔哩哔哩Toy创意挑战 https://www.bilibili.com/v/topic/detail?topic_id=1346285

## 尚未覆盖的检查

- 手机/平板真机性能与触控手感（仅桌面模拟）
- B 站、抖音、YouTube 上传后的转码后观感与音量表现
- 人工审片结论（见 work/审片.html；通过前不上传）
