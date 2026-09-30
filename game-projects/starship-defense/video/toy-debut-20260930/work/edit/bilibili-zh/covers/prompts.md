# 封面制作记录

实际参考：`../../../qa/cover-ref.png`，源视频35.5秒。imagegen生成，2026-09-30。

4:3原始图：`C:/Users/37818/.codex/generated_images/01a0f022-d388-7941-8ae6-f222dae2c6f9/exec-a33edb56-2f07-49a5-bda9-f6d22ae4c8bd.png`。

实际提示词：

Create a finished Chinese Bilibili gaming thumbnail, EXACT 4:3 aspect ratio, 1536x1152. Use attached actual gameplay screenshot as source. Preserve its deliberately simple low-poly graphics and actual blue blocky soldier and small orange insect enemies. You may enlarge/crop/reposition those SAME visible game objects for legibility, but do not invent detailed armor, cinematic graphics, realistic monsters or additional gameplay. Professional bold graphic composition with deep navy backdrop and warm yellow bold readable Simplified Chinese headline exactly '基地能守住吗？', smaller title exactly '虫潮前哨', small badge exactly '已上线 Toy'. Large blue soldier on right, 3 actual orange insects at middle-right, game field behind. Left upper half headline in two lines; subtle yellow accent. Remove telemetry UI from design. No extra text, no model names, no logos except specified Toy text. Keep safe margins and high mobile thumbnail readability. It is a graphic cover based on the game, not claimed raw screenshot.

16:9原始图：`C:/Users/37818/.codex/generated_images/01a0f022-d388-7941-8ae6-f222dae2c6f9/exec-77b11593-2ae5-4396-903e-42df15599731.png`。

实际提示词（同时引用上图与实机）：

Re-layout first attached cover into EXACT 16:9 wide landscape, target 1920x1080, for Bilibili personal space. Keep same graphic style, text and actual simple lowpoly blue soldier/orange bug identities. Second screenshot is actual game reference. Do not add realistic or cinematic detailed models; preserve simple geometry. Preserve ALL exact Chinese text: headline '基地能守住吗？', game name '虫潮前哨', badge '已上线 Toy'. Headline left half in two clean lines with generous safe margins, soldier right lower middle facing bugs on right upper field. No cropping important letters or soldier. Make graphic composition fill entire wide canvas; no letterbox bars, no extra text, no telemetry. Actual game-derived cover, decorative design is okay. Strong white/yellow type and dark navy/green field; same content as first cover with a new wider layout.

导出：4:3原图实际1448×1086，FFmpeg转换JPEG（q:v=2）；16:9原图实际1672×941，等比例规范化：pad至1680×945（每边最多4px深蓝边）、scale1920×1080、JPEG q:v=2，没有拉伸或裁掉内容。生成器输出尺寸不盲信提示词。生成原图仍保留原路径，正式上传物料在final目录。
