# 虫潮前哨 Toy 首发试玩邀请

本期范围：约32秒B站中文短介绍，展示一轮实战并邀请试玩，不是全部武器与升级系统的完整教程。游戏为 toy-v0.1.0，公开入口已发布并在之前的发布任务中验证；原游戏开发模型未核实，不署模型名，不承诺Steam。

## 实机事实与剪辑

输入来自本地Toy同版本包。`capture_server.py`只在本地副本添加录制工具，`capture-recorder.js`调度正常开始、准备按钮和键盘输入。没有修改生命、敌人数值、物理或胜利条件。画面为实时渲染，非离线模拟；录制HUD使用同一游戏的实时数据重新排版。

完整源片为`capture/defense.webm`，约88秒。`capture/defense.json`每半秒记录状态。第一波结束时，50.504秒记录进入第2关，金币310、分数450、基地2000，支持“基地一滴血没掉”；并不表示角色全程无伤。最终各句对应源时间以`edit/shared-zh/timeline.json`为准。

开场选战斗和手雷片段，再回到出门过程，随后退回基地与第一波结果。这是选段剪辑，不声称连续未剪辑通关。

解说终稿：`narration.txt`。字幕来源为Edge返回的实际句边界，存于`audio/timings.json`；服务首句约50ms边界重叠已在字幕中裁到下一句前。字幕非按字数均分。

## 可复现入口

- `narrate.py`：项目venv中安装的edge-tts，云希在线合成，语速+5%。没有克隆真人声音。
- `render.py`：FFmpeg剪辑、ASS烧录、游戏音自动压低、两遍响度归一化与H.264/AAC封装。
- `package.py`：生成投稿文案和JSON，检查真实封面比例、视频哈希。
- FFmpeg：`D:/sd/ffmpeg/bin/ffmpeg.exe`；字体：Windows自带Microsoft YaHei。
- Python：`comfyui-api-server/.venv/Scripts/python.exe`可运行配音；渲染和打包也可使用Codex内置Python。

录制过程中只录到游戏原始混合音（音乐+音效），没有独立原始音乐/音效分轨。已保存解说、剪辑后游戏音、最终混音。没有加入外部音乐。

## 技能改动

本机 `C:/Users/37818/.codex/skills/game-video/` 主技能、UI描述、production、delivery、platforms和series-playbook已统一默认B站中文成片与双封面。抖音/YouTube保留可选能力，仅在明确请求时制作。历史版本不删除。本期没有新增另外两个平台的目录或产物。技能结构验证通过。
