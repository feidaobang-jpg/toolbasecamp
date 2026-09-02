"""
Godot 4 SpriteFrames 文本资源 + ZIP 导出说明。
"""
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional


def _escape_godot_path(rel: str) -> str:
    return rel.replace("\\", "/")


def write_sprite_frames_tres(
    out_path: Path,
    *,
    char_id: str,
    canvas_w: int,
    canvas_h: int,
    animations: Dict[str, Dict[str, Any]],
    frames_root_rel: str = "frames",
    res_prefix: Optional[str] = None,
) -> Path:
    """
    生成 Godot 4 文本版 SpriteFrames（animations 为数组，含 name 字段）。
    默认 ExtResource 使用 res://assets/game_sprites/<char_id>/frames/...
    （与 copy_into_godot_project 目录一致）；也可传自定义 res_prefix。
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prefix = (res_prefix or f"res://assets/game_sprites/{char_id}").rstrip("/")

    ext_resources: List[Dict[str, str]] = []
    anim_entries: List[str] = []
    rid = 1

    sorted_anims = sorted(animations.keys())
    for anim in sorted_anims:
        meta = animations[anim] or {}
        n = int(meta.get("frames") or 0)
        fps = float(meta.get("fps") or 8)
        frame_refs: List[str] = []
        for i in range(n):
            rel = f"{prefix}/{_escape_godot_path(frames_root_rel)}/{anim}/{i:02d}.png"
            eid = f"{rid}_{anim}_{i}"
            ext_resources.append({"id": eid, "path": rel})
            frame_refs.append(
                '{\n'
                f'\t\t\t"duration": 1.0,\n'
                f'\t\t\t"texture": ExtResource("{eid}")\n'
                '\t\t}'
            )
            rid += 1
        frames_body = ",\n".join(frame_refs)
        anim_entries.append(
            "{\n"
            f'\t\t"frames": [\n{frames_body}\n\t\t],\n'
            f'\t\t"loop": true,\n'
            f'\t\t"name": &"{anim}",\n'
            f'\t\t"speed": {fps:.3f}\n'
            "\t}"
        )

    load_steps = len(ext_resources) + 1
    lines: List[str] = [
        f'[gd_resource type="SpriteFrames" load_steps={load_steps} format=3]',
        "",
    ]
    for er in ext_resources:
        lines.append(
            f'[ext_resource type="Texture2D" path="{er["path"]}" id="{er["id"]}"]'
        )
    lines.append("")
    lines.append("[resource]")
    if anim_entries:
        lines.append("animations = [")
        lines.append(",\n".join("\t" + e for e in anim_entries))
        lines.append("]")
    else:
        lines.append("animations = []")
    lines.append("")

    header_note = (
        f"# Generated for {char_id}; canvas {canvas_w}x{canvas_h}. "
        f"Expected under {prefix}/ with frames/ beside godot/.\n"
    )
    out_path.write_text(header_note + "\n".join(lines), encoding="utf-8")
    return out_path


IMPORT_README_MD = """# 导入 Godot 4（AnimatedSprite2D）

## 快速步骤

1. 把本 ZIP 解压到 Godot 工程，例如 `res://assets/sprites/<char_id>/`
2. 目录应含：
   - `frames/<anim>/00.png…`（透明 PNG，同画布、脚底对齐）
   - `sheets/<anim>.png`（可选横向表）
   - `meta.json`（尺寸、锚点、动画表）
   - `godot/<char_id>_frames.tres`（SpriteFrames）
3. 在 Godot 中打开工程，等待导入 PNG
4. 若 `.tres` 路径报错：在文件系统中选中 `.tres`，或用「新建 SpriteFrames」手动把 `frames/` 下各动画帧拖入
5. 场景中添加 `AnimatedSprite2D`，把 `Sprite Frames` 指到该 `.tres`
6. 播放 `idle` / `walk` / `attack` 等动画名（与文件夹名一致）

## 锚点与碰撞

- `meta.json` 的 `anchor` 默认脚底中线 `(0.5, 1.0)`
- 碰撞体请手动加 `CollisionShape2D`（本工具不自动猜多边形）
- 像素风请在导入设置里把 Texture 的 Filter 设为 **Nearest**

## 视角约定

默认 **2D 侧视横版（side-view）**。动作帧以侧面为主。

## 复制到工程（可选）

家里电脑流水线页可填本机 Godot 工程路径，一键复制本资源包到 `res://assets/game_sprites/<char_id>/`。
"""


def write_import_readme(path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(IMPORT_README_MD, encoding="utf-8")
    return path


def build_godot_pack(
    project_dir: Path,
    char_id: str,
    *,
    canvas_w: int,
    canvas_h: int,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    """
    在 project_dir 下写入 godot/*.tres + import_readme.md。
    返回相对路径字典。
    """
    project_dir = Path(project_dir)
    if meta is None:
        meta_path = project_dir / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        else:
            meta = {}
    animations = meta.get("animations") or {}
    godot_dir = project_dir / "godot"
    godot_dir.mkdir(parents=True, exist_ok=True)
    tres_name = f"{char_id}_frames.tres"
    tres_path = godot_dir / tres_name
    write_sprite_frames_tres(
        tres_path,
        char_id=char_id,
        canvas_w=int(meta.get("canvas", {}).get("w") or canvas_w),
        canvas_h=int(meta.get("canvas", {}).get("h") or canvas_h),
        animations=animations,
    )
    readme = write_import_readme(godot_dir / "import_readme.md")
    return {
        "tres": f"godot/{tres_name}",
        "readme": "godot/import_readme.md",
        "tres_abs": str(tres_path.resolve()),
        "readme_abs": str(readme.resolve()),
    }


def zip_project(project_dir: Path, zip_path: Path) -> Path:
    """打包整个角色目录为 ZIP（含 frames/sheets/meta/godot）。"""
    project_dir = Path(project_dir)
    zip_path = Path(zip_path)
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in project_dir.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() in (".mp4", ".webm", ".tmp"):
                # 原始视频较大，默认不进 Godot 包
                continue
            if p.name == zip_path.name:
                continue
            rel = p.relative_to(project_dir)
            zf.write(p, arcname=str(rel).replace("\\", "/"))
    return zip_path


def copy_into_godot_project(
    project_dir: Path,
    godot_project_root: Path,
    char_id: str,
    *,
    rel_under_assets: str = "assets/game_sprites",
) -> Path:
    """
    复制到 Godot 工程：<root>/<rel_under_assets>/<char_id>/
    """
    src = Path(project_dir)
    root = Path(godot_project_root)
    if not root.is_dir():
        raise FileNotFoundError(f"Godot project path not found: {root}")
    dest = root / rel_under_assets / char_id
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    # 复制 frames / sheets / meta / godot（跳过 raw 视频）
    for name in ("frames", "sheets", "godot", "meta.json"):
        sp = src / name
        if not sp.exists():
            continue
        dp = dest / name
        if sp.is_dir():
            shutil.copytree(sp, dp)
        else:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(sp, dp)
    return dest
