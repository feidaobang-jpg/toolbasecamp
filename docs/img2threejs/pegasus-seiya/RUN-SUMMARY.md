# img2threejs Run Summary — Pegasus Seiya

**Reference:** `references/pegasus-seiya.png` (360×640)  
**Profile:** `character`  
**Verdict:** ✅ **可以做** — `character-conditional → stylized`

## 为什么可以做

- 全身、单主体、黑底隔离好
- 盔甲硬表面 + 人形，符合 img2threejs character 轨道
- 用户接受 **动漫 stylized**（非 100%  likeness）

## 主要限制（必须接受）

| 问题 | 说明 |
|------|------|
| 分辨率 360px | 头盔纹饰等 micro detail 只能近似 |
| 动态出拳 + 透视缩短 | 2D 拳头的 foreshortening 无法在单视图 3D 中 1:1 还原 |
| 背面不可见 | 背甲按对称推断 |
| 头发 | 用 stylized cap，不做发丝 |

## 产出物

| 文件 | 说明 |
|------|------|
| `.img2threejs/image-analysis.md` | 视觉分析与 detail inventory |
| `.img2threejs/anatomy.json` + `landmark-overlay.png` | 比例/landmark scaffold |
| `.img2threejs/assessment.json` | pre-spec assessment |
| `.img2threejs/object-sculpt-spec.json` | ObjectSculptSpec 模板（forge 生成） |
| `../../public/html/game/pegasus_seiya_demo.html` | 浏览器可 orbit 的程序化模型 |
| `createPegasusSeiyaModel(spec)` | img2threejs 工厂函数（内联于 demo） |

## 预览

打开：`/html/game/pegasus_seiya_demo.html`

## 与 Meshy 对比（本例）

- **img2threejs**：代码工厂、可改 pose/socket、零 GLB、适合网页内联
- **Meshy**：会出带贴图 mesh，更像原图，但难改 pose、文件更大

## 若要提高还原度

1. 补 **侧面/背面** 参考图（Multi-view）
2. 或改用 **A-pose / T-pose** 静态图再绑骨
3. 多轮 forge `review` + `refine-code` 循环（本 run 完成 blockout→structure→material 首版）
