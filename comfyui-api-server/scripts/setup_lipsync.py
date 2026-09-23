#!/usr/bin/env python3
"""
安装数字人（唇形同步）引擎到 D:\\sd\\{latentsync,musetalk,wav2lip}。

用法：
  python setup_lipsync.py --engine latentsync
  python setup_lipsync.py --engine musetalk
  python setup_lipsync.py --engine wav2lip
  python setup_lipsync.py --engine all
  python setup_lipsync.py --engine latentsync --mark-ready   # 模型自己下好了，只写就绪标记
  python setup_lipsync.py --engine musetalk --verify         # 校验权重与 HF 官方元数据是否一致（强烈建议）

说明：
  仅创建 venv + 克隆仓库 + 装依赖 + 写就绪标记（.tbc_ready）。
  权重文件体积大且常需手动放，脚本不会自动下；按 README 放好后再 --mark-ready。
  国内网络可先 export HF_ENDPOINT=https://hf-mirror.com 再下载。

为什么需要 --verify：
  分块并发下载器为了多线程写入，会先把目标文件预分配成完整大小（稀疏文件），
  于是"文件大小 == 期望大小"在**只写了几 KB** 时也成立。只看大小会把残缺文件
  误判成完整。--verify 从 HF 官方 API 取真实 size/sha256 来比对，才是可信判据。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import venv
from pathlib import Path

PIP_INDEX = os.environ.get("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
TORCH_INDEX = os.environ.get("TORCH_INDEX_URL", "https://download.pytorch.org/whl/cu124")

ROOTS = {
    "latentsync": Path(os.environ.get("LATENTSYNC_ROOT", r"D:\sd\latentsync")),
    "musetalk": Path(os.environ.get("MUSETALK_ROOT", r"D:\sd\musetalk")),
    "wav2lip": Path(os.environ.get("WAV2LIP_ROOT", r"D:\sd\wav2lip")),
}

REPOS = {
    "latentsync": "https://github.com/bytedance/LatentSync.git",
    "musetalk": "https://github.com/TMElyralab/MuseTalk.git",
    "wav2lip": "https://github.com/Rudrabha/Wav2Lip.git",
}

# 每个引擎的权重清单：说明放哪里，仅供人工核对
WEIGHTS = {
    "latentsync": [
        ("checkpoints/latentsync_unet.pt", "LatentSync unet 权重（官方 README 下载）"),
        ("checkpoints/whisper/tiny.pt", "Whisper tiny（音频编码器）"),
        ("checkpoints/vae/diffusion_pytorch_model.safetensors", "sd-vae-ft-mse"),
    ],
    "musetalk": [
        ("models/musetalkV15/unet.pth", "MuseTalk 1.5 unet（约 3.4GB）"),
        ("models/musetalkV15/musetalk.json", "MuseTalk 1.5 配置"),
        ("models/whisper/pytorch_model.bin", "Whisper tiny"),
        ("models/whisper/config.json", "Whisper tiny 配置"),
        ("models/whisper/preprocessor_config.json", "Whisper 预处理器配置"),
        ("models/sd-vae/diffusion_pytorch_model.bin", "sd-vae-ft-mse"),
        ("models/sd-vae/config.json", "sd-vae 配置"),
        ("models/dwpose/dw-ll_ucoco_384.pth", "DWPose 关键点模型"),
        ("models/face-parse-bisent/79999_iter.pth", "面部解析 BiSeNet"),
        ("models/face-parse-bisent/resnet18-5c106cde.pth", "面部解析 ResNet18"),
        # 注：models/syncnet/latentsync_syncnet.pt 仅训练/评测用，推理不需要，故不列入
    ],
    "wav2lip": [
        ("checkpoints/wav2lip_gan.pth", "Wav2Lip GAN 权重（口型更自然）"),
    ],
}

# 权重在 HuggingFace 上的来源：(本地相对路径 -> (repo, repo 内路径))
# 用于 --verify：从官方 API 取真实 size / lfs sha256 做比对。
# 官方 README 的 Google Drive 链接没有可校验的元数据，故不列入。
WEIGHTS_HF = {
    "musetalk": {
        "models/musetalkV15/unet.pth": ("TMElyralab/MuseTalk", "musetalkV15/unet.pth"),
        "models/musetalkV15/musetalk.json": ("TMElyralab/MuseTalk", "musetalkV15/musetalk.json"),
        "models/whisper/pytorch_model.bin": ("openai/whisper-tiny", "pytorch_model.bin"),
        "models/whisper/config.json": ("openai/whisper-tiny", "config.json"),
        "models/whisper/preprocessor_config.json": ("openai/whisper-tiny", "preprocessor_config.json"),
        "models/sd-vae/diffusion_pytorch_model.bin": ("stabilityai/sd-vae-ft-mse", "diffusion_pytorch_model.bin"),
        "models/sd-vae/config.json": ("stabilityai/sd-vae-ft-mse", "config.json"),
        "models/dwpose/dw-ll_ucoco_384.pth": ("yzd-v/DWPose", "dw-ll_ucoco_384.pth"),
        "models/face-parse-bisent/79999_iter.pth": (
            "ManyOtherFunctions/face-parse-bisent", "79999_iter.pth",
        ),
        "models/face-parse-bisent/resnet18-5c106cde.pth": (
            "ManyOtherFunctions/face-parse-bisent", "resnet18-5c106cde.pth",
        ),
    },
}


def _run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)


def _ensure_venv(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    vdir = root / ".venv"
    py = vdir / "Scripts" / "python.exe"
    if not py.is_file():
        print(f"creating venv {vdir}", flush=True)
        venv.create(str(vdir), with_pip=True)
    return py


def _clone_if_needed(engine: str, root: Path) -> None:
    if (root / ".git").is_dir() or (root / "README.md").is_file():
        return
    root.mkdir(parents=True, exist_ok=True)
    if any(root.iterdir()) and not all(p.name.startswith(".") for p in root.iterdir()):
        print(f"[skip] {root} 非空，跳过克隆", flush=True)
        return
    url = REPOS[engine]
    tmp = root.parent / f"_clone_{engine}"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    _run(["git", "clone", "--depth", "1", url, str(tmp)])
    for p in tmp.iterdir():
        dest = root / p.name
        if dest.exists():
            continue
        if p.is_dir():
            shutil.copytree(p, dest)
        else:
            shutil.copy2(p, dest)
    shutil.rmtree(tmp, ignore_errors=True)


def _install_deps(engine: str, root: Path, py: Path) -> None:
    _run([str(py), "-m", "pip", "install", "-U", "pip", "setuptools", "wheel", "-i", PIP_INDEX])

    if engine == "wav2lip":
        # Wav2Lip 老仓库依赖固定版本；torch 走 CUDA 轮子
        _run([str(py), "-m", "pip", "install", "torch", "torchvision", "torchaudio", "--index-url", TORCH_INDEX])
        for pkg in ("numpy<2", "opencv-python", "librosa", "tqdm", "numba"):
            try:
                _run([str(py), "-m", "pip", "install", pkg, "-i", PIP_INDEX])
            except subprocess.CalledProcessError:
                print(f"[warn] {pkg} 安装失败，继续", flush=True)
        return

    _run([str(py), "-m", "pip", "install", "torch", "torchvision", "torchaudio", "--index-url", TORCH_INDEX])
    req = root / "requirements.txt"
    if req.is_file():
        try:
            _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
        except subprocess.CalledProcessError:
            print("[warn] requirements.txt 部分失败（常见于 mediapipe/decord 的 Python 版本约束）", flush=True)
    if engine == "musetalk":
        for pkg in ("openmim", "ffmpeg-python", "diffusers", "transformers", "accelerate"):
            try:
                _run([str(py), "-m", "pip", "install", pkg, "-i", PIP_INDEX])
            except subprocess.CalledProcessError:
                print(f"[warn] {pkg} 安装失败，继续", flush=True)

        # --- 三个踩过的坑，按顺序处理 ---
        # 1) chumpy 是老包（setup.py 里 import pip），必须 --no-build-isolation，
        #    否则报 "ModuleNotFoundError: No module named 'pip'"。
        # 2) mmengine 的 get_installed_path() 依赖 pkg_resources，而 setuptools>=81
        #    已移除它，会报 "No module named 'pkg_resources'"。
        # 3) numpy 必须 <2，否则 mmcv/mmdet 的 C 扩展 ABI 不匹配。
        for pkg, extra in (
            ("pip", []),
            ("setuptools<81", []),
            ("wheel", []),
            ("numpy<2", []),
            ("chumpy", ["--no-build-isolation"]),
        ):
            try:
                _run([str(py), "-m", "pip", "install", *extra, pkg, "-i", PIP_INDEX])
            except subprocess.CalledProcessError:
                print(f"[warn] {pkg} 安装失败，继续", flush=True)

        # OpenMMLab 栈：MuseTalk 1.5 能跑通的组合是 mmcv 2.0.1 + mmdet 3.1.0 + mmpose 1.1.0。
        # 注意 mmpose 必须是 1.1.0（老 API）；装 3.x 会让 MuseTalk 的 import 失败。
        # torch<=2.1 时 mmcv 有官方预编译轮子（cu118/cp310），否则要源码编译，极易失败。
        for mim_pkg in ("mmengine", "mmcv==2.0.1", "mmdet==3.1.0", "mmpose==1.1.0"):
            try:
                _run([str(py), "-m", "mim", "install", mim_pkg])
            except (subprocess.CalledProcessError, FileNotFoundError):
                print(f"[warn] mim install {mim_pkg} 失败，可稍后手动装", flush=True)


def _check_weights(engine: str, root: Path) -> bool:
    missing = []
    for rel, desc in WEIGHTS[engine]:
        if not (root / rel).is_file():
            missing.append(f"  - {rel}    # {desc}")
    if missing:
        print(f"\n[!] {engine} 权重未就绪，请按官方 README 下载后放到 {root}：")
        print("\n".join(missing))
        print("    国内网络可先 export HF_ENDPOINT=https://hf-mirror.com")
        print(f"    放好后执行：python scripts/setup_lipsync.py --engine {engine} --mark-ready\n")
        return False
    return True


def _hf_meta(repo: str, path: str) -> dict:
    """从 HF API 取某个文件的 size 与（LFS 文件的）sha256。"""
    parent = path.rsplit("/", 1)[0] if "/" in path else ""
    url = f"https://huggingface.co/api/models/{repo}/tree/main/{parent}"
    req = urllib.request.Request(url, headers={"User-Agent": "toolbasecamp-setup"})
    with urllib.request.urlopen(req, timeout=30) as r:
        entries = json.load(r)
    name = path.rsplit("/", 1)[-1]
    for e in entries:
        if e.get("path") in (path, name):
            lfs = e.get("lfs") or {}
            return {"size": e.get("size"), "sha256": lfs.get("oid")}
    raise KeyError(f"{repo}:{path} 不在目录列表中")


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for blk in iter(lambda: f.read(1 << 22), b""):
            h.update(blk)
    return h.hexdigest()


def verify_weights(engine: str, root: Path, deep: bool = False) -> bool:
    """比对本地权重与 HF 官方元数据。

    deep=False 只比 size（秒级）；deep=True 还要算 sha256（大文件较慢，几 GB 约数十秒）。
    """
    table = WEIGHTS_HF.get(engine)
    if not table:
        print(f"[i] {engine} 没有可校验的 HF 来源清单，跳过校验", flush=True)
        return True

    bad: list[str] = []
    unknown: list[str] = []
    for rel, (repo, rpath) in table.items():
        local = root / rel
        if not local.is_file():
            bad.append(f"{rel} 不存在")
            print(f"  [X] {rel}  不存在", flush=True)
            continue
        try:
            meta = _hf_meta(repo, rpath)
        except Exception as exc:  # noqa: BLE001
            unknown.append(rel)
            print(f"  [?] {rel}  取远端元数据失败：{exc}", flush=True)
            continue

        lsize = local.stat().st_size
        if meta["size"] is not None and lsize != meta["size"]:
            bad.append(f"{rel} 大小 {lsize} != {meta['size']}")
            print(f"  [X] {rel}  大小 {lsize} != {meta['size']}", flush=True)
            continue
        if deep and meta["sha256"]:
            got = _sha256(local)
            if got != meta["sha256"]:
                bad.append(f"{rel} sha256 不符")
                print(f"  [X] {rel}  sha256 不符\n        got {got}\n        exp {meta['sha256']}", flush=True)
                continue
        tag = "sha256 一致" if (deep and meta["sha256"]) else ("大小一致" if meta["sha256"] else "非 LFS，大小一致")
        print(f"  [v] {rel}  {lsize / 1048576:.1f} MB  {tag}", flush=True)

    if bad:
        print(f"\n[!] {engine} 有 {len(bad)} 个权重不合格：")
        for b in bad:
            print(f"    - {b}")
        print("    残缺/错误文件请删除后重新下载（不要用'文件大小看起来对'来放行）。")
        return False
    if unknown:
        print(f"\n[i] 有 {len(unknown)} 个文件未能取到远端元数据，请人工确认。")
    print(f"[ok] {engine} 权重校验通过", flush=True)
    return True


def _write_marker(engine: str, root: Path) -> None:
    marker = root / ".tbc_ready"
    marker.write_text(
        f"engine={engine}\nready_at={__import__('datetime').datetime.now().isoformat(timespec='seconds')}\n",
        encoding="utf-8",
    )
    print(f"[ok] {engine} 就绪标记已写入 {marker}", flush=True)


def setup(engine: str, mark_ready_only: bool, skip_deps: bool, verify_only: bool, deep: bool) -> int:
    root = ROOTS[engine]

    if verify_only:
        if not root.is_dir():
            print(f"[error] 目录不存在：{root}", file=sys.stderr)
            return 2
        print(f"==== {engine} 权重校验（{'sha256' if deep else 'size'}）====", flush=True)
        if not _check_weights(engine, root):
            return 3
        return 0 if verify_weights(engine, root, deep=deep) else 4

    if mark_ready_only:
        if not root.is_dir():
            print(f"[error] 目录不存在：{root}", file=sys.stderr)
            return 2
        if not _check_weights(engine, root):
            return 3
        # 写标记前顺手做一次（廉价的）大小校验，防止把残缺权重标记成就绪
        if not verify_weights(engine, root, deep=False):
            print("[error] 权重校验未通过，不写就绪标记", file=sys.stderr)
            return 4
        _write_marker(engine, root)
        return 0

    _clone_if_needed(engine, root)
    py = _ensure_venv(root)
    if not skip_deps:
        _install_deps(engine, root, py)
    if _check_weights(engine, root):
        _write_marker(engine, root)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=sorted(ROOTS) + ["all"])
    ap.add_argument("--mark-ready", action="store_true", help="仅核对权重并写就绪标记")
    ap.add_argument("--skip-deps", action="store_true", help="跳过 pip 安装（仅克隆）")
    ap.add_argument("--verify", action="store_true", help="只校验权重与 HF 官方元数据是否一致（比大小）")
    ap.add_argument("--deep", action="store_true", help="配合 --verify：额外比对 sha256（更慢，最可信）")
    args = ap.parse_args()

    targets = sorted(ROOTS) if args.engine == "all" else [args.engine]
    rc = 0
    for eng in targets:
        print(f"\n==== {eng} ====", flush=True)
        rc = max(rc, setup(eng, args.mark_ready, args.skip_deps, args.verify, args.deep))
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
