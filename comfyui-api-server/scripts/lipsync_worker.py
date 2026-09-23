#!/usr/bin/env python3
"""
唇形同步 worker — 在引擎根目录的 venv 里运行（D:\\sd\\latentsync 等）。

由 lipsync_pipeline.py 调用，不直接给用户用。

用法：
  python lipsync_worker.py --engine latentsync --video a.mp4 --audio b.wav --out c.mp4
  python lipsync_worker.py --engine musetalk   --video a.mp4 --audio b.wav --out c.mp4 --version v15
  python lipsync_worker.py --engine wav2lip    --video a.mp4 --audio b.wav --out c.mp4

约定：
  --root 为引擎根目录（含 .venv / .tbc_ready）。默认从对应的环境变量或 D:\\sd\\<engine> 取。
  成功时打印 `OK <out> bytes=<n>`，失败时返回非 0 并在 stderr 说明原因。

各引擎官方 CLI 参数随版本可能变化。脚本会先探测实际存在的入口与配置再拼命令，
并把完整命令打印出来；若与你的版本不符，改对应的 _build_*_cmd。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_ROOTS = {
    "latentsync": (r"D:\sd\latentsync", "LATENTSYNC_ROOT"),
    "musetalk": (r"D:\sd\musetalk", "MUSETALK_ROOT"),
    "wav2lip": (r"D:\sd\wav2lip", "WAV2LIP_ROOT"),
}


def _say(msg: str) -> None:
    print(msg, flush=True)


def _resolve_root(engine: str, raw: str) -> Path:
    if raw.strip():
        return Path(raw.strip())
    default, env_key = DEFAULT_ROOTS[engine]
    return Path((os.environ.get(env_key) or "").strip() or default)


def _run(cmd: list[str], *, cwd: Path, timeout: float | None = None) -> int:
    _say("RUN " + " ".join(cmd))
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env.setdefault("TQDM_DISABLE", "1")
    if _FFMPEG_DIR:
        env["PATH"] = _FFMPEG_DIR + os.pathsep + env.get("PATH", "")
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        env=env,
        timeout=timeout,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    for raw_line in (proc.stdout or b"").splitlines():
        line = _decode(raw_line)
        if line:
            _say(line)
    return int(proc.returncode)


def _decode(raw: bytes) -> str:
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            return raw.decode(enc).rstrip()
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace").rstrip()


_FFMPEG_DIR = ""


def _has_ffmpeg(d: Path) -> bool:
    return (d / "ffmpeg.exe").is_file() or (d / "ffmpeg").is_file()


def _ffmpeg_bin_dir(root: Path | None = None) -> str:
    """ffmpeg 所在目录（MuseTalk / Wav2Lip 要求目录里真的有 ffmpeg.exe）。

    依次尝试：FFMPEG_PATH → PATH → 引擎目录内约定位置 → 常见安装位置 →
    imageio-ffmpeg 自带二进制（改名成 ffmpeg.exe 落到引擎目录）。
    全都不行才返回空串。
    """
    env = (os.environ.get("FFMPEG_PATH") or "").strip()
    if env:
        p = Path(env)
        d = p.parent if p.is_file() else p
        if _has_ffmpeg(d):
            return str(d)

    found = shutil.which("ffmpeg")
    if found and _has_ffmpeg(Path(found).parent):
        return str(Path(found).parent)

    candidates: list[Path] = []
    if root:
        candidates += [
            root / "ffmpeg-4.4-amd64-static",
            root / "ffmpeg",
            root / "bin",
        ]
    candidates.append(Path(r"D:\sd\ffmpeg\bin"))
    for d in candidates:
        if _has_ffmpeg(d):
            return str(d)

    # 兜底：imageio-ffmpeg 的二进制文件名带版本号，MuseTalk 只认 ffmpeg.exe，需改名落地
    try:
        import imageio_ffmpeg  # type: ignore

        src = Path(imageio_ffmpeg.get_ffmpeg_exe())
        if src.is_file():
            base = (root or Path(os.environ.get("TEMP") or ".")) / "ffmpeg-4.4-amd64-static"
            base.mkdir(parents=True, exist_ok=True)
            dst = base / "ffmpeg.exe"
            if not dst.is_file():
                shutil.copyfile(src, dst)
            _say(f"[ffmpeg] 已从 imageio-ffmpeg 落地：{dst}")
            return str(base)
    except Exception:
        pass
    return ""


def _pick(*candidates: Path) -> Path | None:
    for c in candidates:
        if c.is_file():
            return c
    return None


def _first_mp4_under(d: Path, newer_than: float) -> Path | None:
    """取目录下最近生成的 mp4（MuseTalk 由 result_dir 落盘，文件名不可预知）。"""
    best: Path | None = None
    best_mtime = 0.0
    for p in d.rglob("*.mp4"):
        try:
            mt = p.stat().st_mtime
        except OSError:
            continue
        if mt < newer_than - 5:
            continue
        if mt > best_mtime:
            best, best_mtime = p, mt
    return best


# --------------------------------------------------------------------------- #
# 各引擎命令拼装
# --------------------------------------------------------------------------- #

def _build_latentsync_cmd(root: Path, video: Path, audio: Path, out: Path, args) -> list[str]:
    cfg = _pick(
        root / "configs" / "unet" / "stage2_512.yaml",
        root / "configs" / "unet" / "stage2.yaml",
        root / "configs" / "unet" / "stage2_256.yaml",
    )
    ckpt = _pick(
        root / "checkpoints" / "latentsync_unet.pt",
        root / "checkpoints" / "latentsync_unet_1.6.pt",
    )
    cmd = [
        sys.executable, "-m", "scripts.inference",
        "--video_path", str(video),
        "--audio_path", str(audio),
        "--video_out_path", str(out),
        "--inference_steps", str(int(args.steps)),
        "--guidance_scale", str(float(args.guidance)),
    ]
    if ckpt:
        cmd += ["--inference_ckpt_path", str(ckpt)]
    if cfg:
        cmd += ["--unet_config_path", str(cfg)]
    cmd += ["--seed", str(int(args.seed))]
    return cmd


def _build_musetalk_cmd(root: Path, video: Path, audio: Path, out: Path, args) -> tuple[list[str], Path, Path]:
    """返回 (cmd, result_dir, yaml_path)。MuseTalk 通过 yaml 传输入。"""
    version = (args.version or "v15").strip().lower()
    if version in ("v1.5", "1.5", "15"):
        version = "v15"
    elif version in ("v1", "v1.0", "1.0"):
        version = "v1"

    if version == "v15":
        unet = _pick(root / "models" / "musetalkV15" / "unet.pth")
        unet_cfg = _pick(root / "models" / "musetalkV15" / "musetalk.json")
    else:
        unet = _pick(root / "models" / "musetalk" / "pytorch_model.bin")
        unet_cfg = _pick(root / "models" / "musetalk" / "musetalk.json")

    result_dir = Path(tempfile.mkdtemp(prefix="tb_musetalk_"))
    cfg_dir = root / "configs" / "inference"
    cfg_dir.mkdir(parents=True, exist_ok=True)
    yaml_path = cfg_dir / f"tb_{os.getpid()}_{int(time.time())}.yaml"
    yaml_path.write_text(
        "task_0:\n"
        f"  video_path: {video.as_posix()!r}\n"
        f"  audio_path: {audio.as_posix()!r}\n"
        "  bbox_shift: 0\n",
        encoding="utf-8",
    )

    cmd = [
        sys.executable, "-m", "scripts.inference",
        "--inference_config", str(yaml_path),
        "--result_dir", str(result_dir),
        "--version", version,
        "--bbox_shift", str(int(args.bbox_shift)),
    ]
    if unet:
        cmd += ["--unet_model_path", str(unet)]
    if unet_cfg:
        cmd += ["--unet_config", str(unet_cfg)]
    ff = _ffmpeg_bin_dir(root)
    if ff:
        cmd += ["--ffmpeg_path", ff]
    return cmd, result_dir, yaml_path


def _build_wav2lip_cmd(root: Path, video: Path, audio: Path, out: Path, args) -> list[str]:
    ckpt = _pick(
        root / "checkpoints" / "wav2lip_gan.pth",
        root / "Wav2Lip" / "checkpoints" / "wav2lip_gan.pth",
        root / "checkpoints" / "wav2lip.pth",
    )
    cmd = [
        sys.executable, "inference.py",
        "--face", str(video),
        "--audio", str(audio),
        "--outfile", str(out),
        "--pads", "0", "10", "0", "0",
        "--resize_factor", str(int(args.resize_factor)),
    ]
    if ckpt:
        cmd += ["--checkpoint_path", str(ckpt)]
    return cmd


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=sorted(DEFAULT_ROOTS))
    ap.add_argument("--video", required=True, help="输入视频（静态图请先由上游转成视频）")
    ap.add_argument("--audio", required=True, help="输入音频 wav/mp3")
    ap.add_argument("--out", required=True, help="输出 mp4")
    ap.add_argument("--root", default="")
    ap.add_argument("--version", default="v15", help="MuseTalk 版本：v15 / v1")
    ap.add_argument("--seed", type=int, default=1247)
    ap.add_argument("--steps", type=int, default=20, help="LatentSync 推理步数")
    ap.add_argument("--guidance", type=float, default=1.5)
    ap.add_argument("--bbox-shift", type=int, default=0)
    ap.add_argument("--resize-factor", type=int, default=1)
    ap.add_argument("--timeout", type=float, default=0.0, help="秒；0 表示不限")
    args = ap.parse_args()

    engine = args.engine
    root = _resolve_root(engine, args.root)
    video = Path(args.video).resolve()
    audio = Path(args.audio).resolve()
    out = Path(args.out).resolve()

    if not root.is_dir():
        _say(f"ERROR: 引擎根目录不存在：{root}（先跑 scripts/setup_lipsync.py --engine {engine}）")
        return 2
    if not video.is_file():
        _say(f"ERROR: 输入视频不存在：{video}")
        return 2
    if not audio.is_file():
        _say(f"ERROR: 输入音频不存在：{audio}")
        return 2

    out.parent.mkdir(parents=True, exist_ok=True)
    if out.is_file():
        out.unlink()

    _say(f"engine={engine} root={root}")
    global _FFMPEG_DIR
    _FFMPEG_DIR = _ffmpeg_bin_dir(root)
    if _FFMPEG_DIR:
        _say(f"ffmpeg_dir={_FFMPEG_DIR}")
    else:
        _say("ffmpeg_dir=(未找到，若引擎报错请设置 FFMPEG_PATH)")
    start = time.time()
    timeout = float(args.timeout) if args.timeout and args.timeout > 0 else None
    tmp_yaml: Path | None = None
    result_dir: Path | None = None

    try:
        if engine == "latentsync":
            cmd = _build_latentsync_cmd(root, video, audio, out, args)
            rc = _run(cmd, cwd=root, timeout=timeout)
        elif engine == "musetalk":
            cmd, result_dir, tmp_yaml = _build_musetalk_cmd(root, video, audio, out, args)
            rc = _run(cmd, cwd=root, timeout=timeout)
            if rc == 0 and not out.is_file() and result_dir:
                produced = _first_mp4_under(result_dir, start)
                if produced:
                    shutil.copyfile(produced, out)
        else:
            cmd = _build_wav2lip_cmd(root, video, audio, out, args)
            rc = _run(cmd, cwd=root, timeout=timeout)
    except subprocess.TimeoutExpired:
        _say(f"ERROR: 超时（>{timeout:.0f}s）")
        return 4
    finally:
        if tmp_yaml and tmp_yaml.is_file():
            try:
                tmp_yaml.unlink()
            except OSError:
                pass
        if result_dir and result_dir.is_dir():
            shutil.rmtree(result_dir, ignore_errors=True)

    if rc != 0:
        _say(f"ERROR: 引擎退出码 {rc}")
        return rc or 5
    if not out.is_file() or out.stat().st_size < 1024:
        _say(f"ERROR: 输出未生成：{out}")
        return 3

    _say(f"OK {out} bytes={out.stat().st_size} elapsed={time.time() - start:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
