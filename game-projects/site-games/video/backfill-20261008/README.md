# 旧游戏视频补发包（2026-10-08）

本批选择虫潮围城母皇战、赤色要塞双关救援、恐龙快打三视角实录。每期交付YouTube中文主版与抖音横屏版，另交一条虫潮完整英文试验版，共7版。历史B站稿件保留，本批7版已上传，公开状态见下表。

## 审片与投稿入口

- [审片页面](审片.html)：7个播放器、各平台文案和字幕入口。YouTube预览字幕直接嵌入页面，可在本地打开后切换；真实上传附件仍是各自final目录内的SRT。
- `final/<游戏>/<平台语言>/`：本平台最终视频、16:9封面与独立文案TXT；YouTube另含中英SRT与英文本地化字段。
- [7版清单](work/publish.json)、[当前发布状态](work/publication-result.json)、[继续工作位置](work/run-state.json)。

录制日期已标在成片及文案中，当前试玩与旧片操作可能不同。中文主版保留中文配音、标题、封面与简介；YouTube添加英文字幕及元数据翻译。英文试验版更换完整英文配音及包装，保留实际中文游戏界面。英文游戏名为本片翻译，不改变产品名称。

## 当前状态

用户于2026-10-08回复“可以，继续把”，本批7版审片通过，已关联视频、封面和字幕哈希。实际账号：YouTube郑晓辉（频道UCha4DVE3db0P1eJvu4qsLJg）；抖音飞刀帮主（公开抖音号84261875244）。

| 版本 | 状态 | 投稿ID / 公开入口 |
| --- | --- | --- |
| swarm-youtube-zh | published | [5pr0fr0CMl0](https://www.youtube.com/watch?v=5pr0fr0CMl0) |
| swarm-douyin-zh | published | [7694177740940922131](https://www.douyin.com/video/7694177740940922131) |
| jackal-youtube-zh | published | [9MwVi2fVMPo](https://www.youtube.com/watch?v=9MwVi2fVMPo) |
| jackal-douyin-zh | published | [7694182043927760191](https://www.douyin.com/video/7694182043927760191) |
| cadillacs-youtube-zh | published | [fJBtG1-njZc](https://www.youtube.com/watch?v=fJBtG1-njZc) |
| cadillacs-douyin-zh | published | [7694183607279062326](https://www.douyin.com/video/7694183607279062326) |
| swarm-youtube-en | published | [-RWUU4wpAuY](https://www.youtube.com/watch?v=-RWUU4wpAuY) |

YouTube四版中英手工字幕均已上传并在公开播放器核验，三条中文主版英文标题与简介已发布。抖音横4:3及竖3:4封面实际上传，游戏视频保持横屏。门户的截屏封面建议已记录，不表示投稿失败。公开视频实机与字幕在桌面网页检查，未做真实手机验收。YouTube试玩URL可复制，频道尚需一次性验证才支持可点击的外部链接。

X每期一条英文文案已加真实YouTube链接，虫潮优先英文版；保存在[三条X文案](work/publish/x/drafts.json)。当前没有本人已确认的官方API或已授权连接器，尚未发X；Metricool仅是未安装的候选，X需要付费套餐和附加项，未购买。通知登录事件已核验恢复并Resolve。

## 来源与制作

[来源索引](work/sources/source-index.json)保存原片哈希、既有BV与原目录，`work/sources/<游戏>/`保存原始来源和署名副本。原始实机及大体积工程仍在索引指向的本机旧期目录，本批不改动它们。

虫潮旧曼波音轨记录的使用范围仅为原B站视频，因此本批中文全部重新使用云希配音；英文试验使用Guy。赤色要塞、恐龙快打正文沿用原云希音轨，新收尾继续使用云希。重新配音以实际WordBoundary对齐字幕，镜头按语音重排；不是新录制的连续实时通关。完整来源记录与许可检查保存在work内。

## 复现与保全

本机Python需已有Pillow、edge-tts，FFmpeg/ffprobe在PATH，Windows已有字体与NVENC。本批制作文件：

1. `work/backfill-plan.json`固定片源、语稿、译文及选片范围。
2. `work/render_backfill.py --phase all`重新制作；`pilot`、`swarm-cn`可单独重做对应配音版本。已有声音及真实时间戳缓存位于work/audio。
3. `work/package_backfill.py`生成物料与清单；发现已审/已上传状态时拒绝覆盖。
4. `work/douyin_covers.py`制作平台4:3/3:4封面；`work/publication_state.py`按账号锁保存实际稿件ID和状态；`work/publication_notes.py`更新发布记录与X续接文案，不执行远端投稿。
5. `work/verify_backfill.py`完整解码、检查字幕/哈希/引用，并留存抽查帧；`work/audio_metrics.py`检测4条不同音轨的响度与峰值。

媒体文件依照仓库既有规则不进Git，保留在本任务worktree。已审片通过并上传，X续接及媒体保全尚有后续，暂不归档工作区；以后清理前必须另行保全全部必要媒体。文本、字幕、制作方案及状态记录提交至仓库，不代表Git克隆包含成片。
