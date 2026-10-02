# 普通第一关流程修复

用户当前网站显示准备按钮与野怪数，属于准备阶段。预设8野怪，50%额外1小首领，分散在野外；不是开战前只有1只正式敌人。正式第一关另生成12虫，远处接近会有等待。

确定性复现并修复：清关后1.5秒内暂停，原setTimeout跳过startPrep，恢复后w.done一直true。改为游戏时钟倒计时，暂停保留、恢复继续，准备阶段重置波次。

七项回归通过，见before/after；网站部署已核对。仅本次网站版本升级，Toy预览保留v0.8。

## Toy 提交补记

2026-10-02 用户要求更新到Toy，v0.8.1已提交审核，CLI和mylist均为auditing。提交预览：https://www.bilibili.com/toy/preview/preview_VQltyymQ/index.html 。原正式地址保持不变，审核通过后才生效；尚未宣称已发布新包。
