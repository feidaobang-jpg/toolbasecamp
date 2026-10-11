# 发布续接

用户已经批准三平台发布。抖音和YouTube已发布并公开核验，不能重复上传。未完成的目标仅为B站及依赖新BV的收尾。

- 抖音：https://www.douyin.com/video/7695187880532135178 ，账号84261875244，已发布、作品状态正常。
- YouTube：https://youtu.be/X3Lc6SZ6whE ，频道UCha4DVE3db0P1eJvu4qsLJg，中英文字幕和英文元数据已发布。
- B站：尚未上传、投稿或生成BV。

## 当前阻碍

`C:/Users/37818/.claude/state/bili-activities/account-write.lock`由Trae任务`mario-stage4-release-20261010`持有，目标是玛丽两条既有视频简介。owner.json取得时间2026-10-10T23:53:11.8969063+08:00。最近复查仍有Trae进程运行，无法证明持有任务已退出且没有写操作；不能凭锁龄删除。

依据`.cursor/rules/auto-commit-push.mdc`：“不覆盖、不删除别人的锁。只有核实持有任务已退出且没有操作进行中，才可恢复遗留锁。”

用户已被询问该任务是否退出，飞书NeedsUser事件`bilibili-16214353-write-lock-mario-stage4-release-20261010`已经发送，不重复提醒。不创建定时任务、不打断其他会话、不接管玛丽或Toy的在途工作。持有者释放或用户明确确认退出且无B站写操作后，核验恢复并Resolve该事件。

## B站续接操作

1. 按项目规则原子取得上述账号锁，owner写当前Codex任务、绝对工作区、目标与时间。写前核对UID16214353和本人内容管理，重读共享发布台账查重。
2. 上传`final/bilibili-zh/gameplay-zh-final.mp4`，SHA256 `25733511fcedbb7e76e9b32408c0269278200ece1a1acddd329e960b6f5241ef`。上传已审片双封面：首页4:3、空间16:9；按本版清单填写标题/简介/标签、原创分类和适用AI声明。
3. 投稿时重新核对当期官方免费活动与已有权益互斥；只加入真实相关、符合条件、无新增重大承诺的普通活动。Toy公开入口仍不可用时不用Toy试玩话题，也不宣称已恢复。
4. 提交后记真实稿件ID、BV及审核状态；审核中不等于发布。写锁只覆盖提交与记账，等待平台审核释放自有锁。
5. 公开可见后：加入正式虫潮合集9248439，核验顺序；`toy video bind <BV> --toy 38678478981120`并`toy video list`核验，Toy写操作另取作品锁；准确处理试玩/愿望单置顶及既有主推视频引流。
6. 查看已领取免费流量奖励，优先即将过期且符合稿件条件的券，核验使用记录；不付费推广。官方推流表只有实际符合条件才提交，保存真实回执，不能将申请写成获得推流。
7. 更新两份项目结果、对应共享台账，保存公开截图，提交本任务文件、整合最新master后正常推送；全部请求目标完成才标记completed。

使用`C:/Users/37818/.claude/skills/game-video/SKILL.md`、`references/multiplatform-publishing.md`和`references/bilibili-publishing.md`的实际流程。通知工具每次必须Source Codex。所有最终素材保存在D:/project/toolbasecamp-artifacts/conquest-video-20261011，工作分支codex/conquest-video-20261011。

## 2026-10-11简介更新规则

本期首次投稿简介不受普通小改累计门槛限制。既有视频简介和公告独立判断：重大版本、现有说明失实或有具体必要性时立即更新；普通小改须累计至少3次有意义的稳定更新且距该目标最后公开核验更新至少7天。未达条件只记待合并，不新增评论或公告绕过门槛。此次发布记录和内部提交不算游戏稳定更新；不接管其他开发任务的说明同步。B站过审后的旧主推视频维护须先核对最新公开全文与基线并记录触发理由。
