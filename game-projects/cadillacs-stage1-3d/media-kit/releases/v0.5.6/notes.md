# v0.5.6 全屏入口按浏览器能力显示

普通补丁。全屏入口改为按浏览器实际能力显示：支持元素全屏且 fullscreenEnabled 不为 false 时显示（含手机），iPhone Safari、未授权全屏的 iframe 隐藏；删除按手机隐藏的旧样式并压过公共界面的 display:block!important；菜单键盘导航只取实际可见项。

验收（game-projects/cadillacs-stage1-3d/qa/fullscreen.js）：桌面、手机横屏、竖屏旋转 × 支持/不支持全屏，73/73 通过；支持时点击进入全屏、退出后照旧自动暂停，不支持时按钮与菜单项隐藏、键盘 ↑↓ 走一圈不卡。F 键在不支持时提示后继续游玩。原有回归：desktop.json 90/90，mobile.json 35/35，stage2.json 55/55。未做真机验收。

网站部署核验后同步一次 Toy；B站简介按分渠道节奏累计（现有简介未提全屏）。
