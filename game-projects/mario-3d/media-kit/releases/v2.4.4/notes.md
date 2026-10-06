# v2.4.4

修复用户反馈的圆度、绿色、1-1过关中断和J键透明问题。
水管根因是10段圆柱、flatShading与通用石材贴图的棕色边框；不改变地图、碰撞与整款画风。
过关根因是updateFlag.walk调用不存在的groundTopAt，使用现有moveBody避免重复地面查询。
J键原为能力不足的native disabled + opacity:.45，现在以文字及aria-disabled表示能力门槛，点击可解释。
其他游戏：坦克、赤色要塞、恐龙快打未发现整键禁用透明问题；虫潮保留原创半透明底板，文字/整体opacity=1。额外检查本站西游3D发现冷却/资源不足opacity=.55，同任务修复，Toy仍为旧2D版，禁止覆盖。
网站/Toy按最终记录核实，通关严重修复触发B站说明同步。封面沿用：局部补丁未改变整体画风或主题。
本机公共game-maker技能已在独占写锁下更新并通过quick_validate；实体动作键不可用状态用标签和aria-disabled表达，输入层仍阻止动作。
