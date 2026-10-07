# 本期输入和复现入口

网站：https://www.zhengxiaohui.cn/html/game/tank-3d/index.html
Toy：https://www.bilibili.com/toy/feidao-tank-3d/index.html
Toy实际iframe：https://www.bilibilitoy.com/toy/feidao-tank-3d/39043249461248-v23227/index.html
公开Toy版本：landscape-menu1；main.js SHA-256：4359be5a6020da3866fe9993776693acea591c3f13b3b197076ea9a7996887cb；检查时间：2026-10-07T02:04:58.326Z。
录制三个原片及其运行JS哈希见 capture-index.json；详细原始读数保存在 tmp/capture-index-full.json。
CDP第一轮GPU时间戳出现回退，最初错误夹住负时间造成片尾截断；正式版由 retime.py 依据原始帧落盘时间恢复接收时序，丢弃非递增帧。画面内容及原始音频未修改。
接收／落盘时间不能等同GPU真实帧时刻，可能有几十毫秒误差。最终片尾、动作对应与字幕已抽查；游戏音效主观同步仍由最终听审确认。
口播与字幕来自 narration.json 与 audio/shared-zh/*.json 的实际 Edge WordBoundary；时间轴与字幕工程在 edit/shared-zh。
生产命令依次为 capture.cjs、retime.py、voice.py、render.py、covers.py、review_frames.py final、verify.py、package.py。
录制脚本使用本机已有Playwright及Edge；FFmpeg/FFprobe在PATH，导出H.264 NVENC。
TTS命令使用 D:/project/toolbasecamp/comfyui-api-server/.venv/Scripts/python.exe -X utf8 work/voice.py；未安装或改动共享环境。
配音默认值已按2026-10-07用户要求修改 game-video SKILL.md、references/production.md 和 video-voice-tooling.md，经过技能校验。
流量说明依据B站官方推荐说明： https://www.bilibili.com/blackboard/activity-gPIvOmhxbh.html 。声音工具更换不构成流量效果保证。
官方AI内容说明参考： https://www.bilibili.com/opus/840812291428450327 。发布时以实际声明入口为准。
活动台账2026-10-07 10:03已有相关部分检查：Toy活动已参加、无新增报名、任务进度1378/10000。此处仅读取台账，未当作全面检查。新片待人工审片，发片及用券检查在发布闭环继续。
