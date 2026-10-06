# fs-capable1 全屏入口按浏览器能力显示

普通补丁。全屏入口改为按浏览器实际能力显示：支持元素全屏且 fullscreenEnabled 不为 false 时显示（含手机），iPhone Safari、未授权全屏的 iframe 隐藏；删除按手机隐藏的旧样式并压过公共界面的 display:block!important；菜单键盘导航只取实际可见项。

验收（game-projects/tank-3d/qa/fullscreen.cjs）：桌面、手机横屏、竖屏旋转 × 支持/不支持全屏，71/71 通过；支持时点击进入全屏、退出后照旧自动暂停，不支持时按钮与菜单项隐藏、键盘 ↑↓ 走一圈不卡。本游戏没有 F 全屏快捷键，未新增。原有回归：browser-check.json 18/18。未做真机验收。

网站部署核验后同步一次 Toy；B站简介按分渠道节奏累计（现有简介未提全屏）。
