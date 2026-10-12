# 素材来源

- 游戏版本：赤色要塞 3D v0.11.0，录的是线上网站现行版本 `https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html`（与 Toy 公开入口同一个包）。没有为录像改游戏。
- 录制方式：`record.cjs`，Playwright + 系统 Edge 无头，1920×1080，正常界面与键盘操作；CDP 逐帧截图（JPEG 93，带真实时间戳，约 48 帧/秒）编码成 30 帧原片；游戏声音同场单独录。标准 3 格护甲、无限命、无敌关闭。
- 操作者：`qa/bot.js` 自动试玩机器人（会躲子弹），不是真人手打。成片里不要写成真人实况。
- 原片：
  - `capture/run-1791794419016/raw.mp4`　173.37 秒　sha256 964ebd050c8f8efd…　结局 result / 阵亡 1 / 送达 12
  - `capture/run-front-1791794615235/raw.mp4`　419.97 秒　sha256 70776824adb8cae2…　结局 None / 阵亡 0 / 送达 0
  - `capture/idle1-1791794354371/raw.mp4`　21.97 秒　sha256 b50cdec959e0865b…　结局 None / 阵亡 1 / 送达 0
  - `capture/idle-1791794303805/raw.mp4`　15.97 秒　sha256 deefd10aa9f457d9…　结局 None / 阵亡 0 / 送达 0
  - `capture/fp-1791794383120/raw.mp4`　15.6 秒　sha256 0ca2df0848c1574a…　结局 None / 阵亡 1 / 送达 0
  - `run-front` 那一遍机器人在仓库货场原地停了约 140 秒（和巡逻坦克对峙），没打到 Boss；只用它开头 30 秒的低位正视画面。
  - `fp`（第一人称）开进闸门后镜头贴墙、随后阵亡，没有采用。
- 改动前对照：`media-kit/releases/v0.11.0/dev/before-live-v0103-idle-22s.webm`，2026-10-12 部署前录自线上旧版（1280×720，无声）。
- 开发中画面：`media-kit/releases/v0.11.0/dev/first-*.png`（第一版）与 `fix1-*.png`（修正后），都是当天开发过程的真实截图（1280×720），成片里放大并标注。
- 配音：本地 IndexTTS-2.5 逐句合成（`voice_indextts.py`，参考音 `yunxi-ref-8s.wav`，与当天超级玛丽 1-4 那条视频用的是同一个），**不是微软官方云希**。原因：2026-10-12 Edge 在线语音对 edge-tts 7.2.8 返回 403（上游 rany2/edge-tts issue #490；换成本机 Edge 版本号仍 403，语音列表接口正常）。每句单独合成，字幕时间取每句的真实时长。`audio/draft-sapi/` 是更早用系统自带语音做的画面样片，已不用。
- 字体：微软雅黑粗体（系统字体）。没有使用外部音乐或生成图片。
- 原作《Jackal / 赤色要塞》版权归 Konami；游戏内第三关 BGM 是原版录音，曲目对应关系未核实（见 media-kit/releases/v0.11.0/audio-sources.json）。
