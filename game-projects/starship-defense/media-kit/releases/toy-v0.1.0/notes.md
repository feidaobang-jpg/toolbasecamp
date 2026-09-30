# Toy 首发验收与发布记录

- 日期：2026-09-30
- Toy 名称：虫潮前哨：守卫基地
- Toy ID：38678478981120
- 账号：飞刀班长（用户已在官方 OAuth 页面完成授权）
- 本次提交响应：auditing（审核中）；不代表正式上线。
- 提交后的预览：https://www.bilibili.com/toy/preview/preview_3tNRtOgC/index.html
- 实际操作验收使用同一包的首次预览：https://www.bilibili.com/toy/preview/preview_gy9HwKB7/index.html

## 已验证

- 官方 toy_doctor 静态检查：0 ERROR；资源未带内容指纹有一项非阻断 WARN。
- JS 语法检查通过；真实 Toy 预览无已捕获的浏览器脚本错误。
- 本地桌面视口：键盘开始、R开战、手雷数量减少、暂停、手动存档及重开本关。
- 390×844 模拟视口：游戏自动横向旋转，开战入口可操作。
- Toy 真实域名：进入游戏、静音、开战、虚拟U按钮投掷手雷，第一关完成后进入第二关，金币从150增加到310、分数到300。
- 预览采用用户输入/浏览器UI自动化，没有通过修改内部游戏变量制造过关。

## 验收限制

- 手机为视口模拟，未测试实体手机多点触控与性能；未做全部章节平衡测试。
- 本次为现有玩法的发布适配，未新增玩法；未制作视频，也没有完整可交给视频剪辑的玩法录像。后续game-video须补录，媒体就绪状态为partial。
- 手动全屏具有失败提示，但平台内全屏未专项验收。
- 本次未绑定已有视频、未发视频或评论。

## 素材

运行资源来自用户现有工程：程序化几何、场景与Web Audio合成声音。Three.js r152的MIT说明保留，并附完整许可。截图是本次构建的真实实机，不是AI宣传图。原游戏历史开发模型未知，不新增归因。
## 发布完成

官方mylist已返回published、PUBLIC；正式入口 https://www.bilibili.com/toy/chongchao-qianshao/index.html 已实际打开并验证开局。正式画面保存为captures/toy-published.png。
