"""Qwen-Image-2.1（7B 开源权重）本地 ComfyUI 接入。

设计要点：权重文件还没下载时也要能装上。这里不硬编码文件名，而是按
「候选关键字」到 ComfyUI 的 object_info 里自动发现实际文件名 —— 把权重
放进 models/ 对应目录并重启 ComfyUI 即可用，无需改代码。
"""

from __future__ import annotations

import json
import os
from typing import Optional

import requests

QWEN21_MODEL_ID = "qwen-image-2.1:7b"
QWEN21_LABEL = "Qwen-Image-2.1 · 7B（本地）"

# 顺序即优先级：先精确的 2.1 专名，再逐级放宽到通用 qwen-image。
_DIFFUSION_KEYS = (
    ("qwen_image_2_1", "qwen-image-2.1", "qwen_image_21", "qwenimage21"),
    ("qwen_image_2", "qwen-image-2"),
    ("qwen_image", "qwen-image"),
)
# 优先级即正确性：2.1 主模型要求 4096 维文字向量 = Qwen3-VL-8B。
# 2.5-VL-7B 是 3584 维，误选会在 KSampler 报 normalized_shape 错，
# 故 3vl-8b 系排最前，2.5 系只做末位兜底。
_CLIP_KEYS = (
    ("qwen3vl_8b", "qwen3_vl_8b", "qwen3-vl-8b"),
    ("qwen3_vl", "qwen3-vl", "qwen3vl"),
    ("qwen3.5_9b_qwen_image_2.1",),
    ("qwen_2_5_vl_7b", "qwen2.5_vl_7b", "qwen2.5-vl-7b"),
    ("qwen_vl", "qwen2_vl"),
)
_VAE_KEYS = (
    ("qwen_image_2.1_vae", "qwen-image-2.1-vae", "qwen_image_2_1_vae"),
    # 不提供通用 qwen_image_vae 回退：老版 VAE 与 2.1 潜空间维度不符，
    # 会在 VAEDecode 报 IndexError；缺 2.1 VAE 时应判为未就绪并明确报错。
)

# 采样参数：7B 版官方推荐值未在仓库中明确给出，做成可配置，默认取
# Qwen-Image 系列的通用档位（20 步 / cfg 2.5 / euler+simple）。
DEFAULT_STEPS = int(os.environ.get("QWEN21_STEPS", "20"))
DEFAULT_CFG = float(os.environ.get("QWEN21_CFG", "2.5"))
DEFAULT_SAMPLER = os.environ.get("QWEN21_SAMPLER", "euler")
DEFAULT_SCHEDULER = os.environ.get("QWEN21_SCHEDULER", "simple")
DEFAULT_MEGAPIXELS = float(os.environ.get("QWEN21_MEGAPIXELS", "1.0"))

_object_info_cache: dict = {}


class Qwen21NotReady(RuntimeError):
    """权重未就位（未下载 / 未重启 ComfyUI）。"""


def clear_cache() -> None:
    _object_info_cache.clear()


def _fetch_object_info(server_address: str, class_type: str) -> dict:
    key = f"{server_address}|{class_type}"
    if key in _object_info_cache:
        return _object_info_cache[key]
    try:
        r = requests.get(
            f"http://{server_address}/object_info/{class_type}", timeout=8
        )
        r.raise_for_status()
        _object_info_cache[key] = r.json().get(class_type, {}) or {}
    except Exception as e:  # ComfyUI 未启动等
        print(f"WARN: fetch object_info/{class_type} failed: {e}")
        _object_info_cache[key] = {}
    return _object_info_cache[key]


def _loader_names(server_address: str, class_type: str, field: str) -> list:
    info = _fetch_object_info(server_address, class_type)
    names = info.get("input", {}).get("required", {}).get(field, [[]])[0]
    return list(names) if isinstance(names, list) else []


def _compact(s: str) -> str:
    return s.replace("_", "").replace("-", "").replace(".", "").replace(" ", "")


def _match_weight(names: list, key_groups: tuple) -> Optional[str]:
    """按候选组挑一个权重文件名：先同组精确命中，再跨组放宽。"""
    if not names:
        return None
    pairs = []
    for n in names:
        s = str(n)
        base = s.replace("\\", "/").lower().rsplit("/", 1)[-1]
        pairs.append((base, _compact(base), s))
    for group in key_groups:
        for k in group:
            kl = k.lower()
            kc = _compact(kl)
            for base, bc, orig in pairs:
                if base.startswith(kl) or bc.startswith(kc):
                    return orig
    return None


def discover_weights(server_address: str) -> dict:
    """发现 Qwen-Image-2.1 三件套权重。

    返回 {diffusion, clip, vae, ready, missing[]}；未找到的项为 None 并进 missing。
    """
    diffusion = _match_weight(
        _loader_names(server_address, "UNETLoader", "unet_name"), _DIFFUSION_KEYS
    )
    clip = _match_weight(
        _loader_names(server_address, "CLIPLoader", "clip_name"), _CLIP_KEYS
    )
    vae = _match_weight(
        _loader_names(server_address, "VAELoader", "vae_name"), _VAE_KEYS
    )
    missing = []
    if not diffusion:
        missing.append("models/diffusion_models/ ← Qwen-Image-2.1 主模型")
    if not clip:
        missing.append("models/text_encoders/ ← Qwen2.5-VL-7B 文本编码器")
    if not vae:
        missing.append("models/vae/ ← qwen_image_vae")
    return {
        "diffusion": diffusion,
        "clip": clip,
        "vae": vae,
        "ready": not missing,
        "missing": missing,
    }


def require_weights(server_address: str) -> dict:
    w = discover_weights(server_address)
    if w["ready"]:
        return w
    raise Qwen21NotReady(
        "未找到 Qwen-Image-2.1 权重（缺：" + "；".join(w["missing"]) + "）。"
        "请把对应文件放进 ComfyUI 的 models/ 目录，重启 ComfyUI 后再试。"
    )


def _resolve_clip_type(server_address: str, preferred: str = "qwen_image") -> str:
    """CLIPLoader 的 type 枚举随 ComfyUI 版本变化，按可用性回退。"""
    info = _fetch_object_info(server_address, "CLIPLoader")
    types = info.get("input", {}).get("required", {}).get("type", [[]])[0]
    if not isinstance(types, list) or not types:
        return preferred
    norm = [str(t) for t in types]
    if preferred in norm:
        return preferred
    low = {t.lower(): t for t in norm}
    for cand in ("qwen_image", "qwen", "qwen2.5_vl", "qwen_vl"):
        if cand in low:
            return low[cand]
    # 没有任何 qwen 系列 type：多为 ComfyUI 版本过旧。保留首选值，
    # 让 ComfyUI 明确报 "value not in list"，而不是静默用错类型生成垃圾结果。
    return preferred


def _load_workflow(workflow_dir: str, filename: str) -> dict:
    path = os.path.join(workflow_dir, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Workflow file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _apply_weights(workflow: dict, w: dict, clip_type: str) -> dict:
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        ct = node.get("class_type")
        if ct == "UNETLoader":
            inputs["unet_name"] = w["diffusion"]
        elif ct == "CLIPLoader":
            inputs["clip_name"] = w["clip"]
            inputs["type"] = clip_type
        elif ct == "VAELoader":
            inputs["vae_name"] = w["vae"]
    return workflow


def _ksampler_inputs(workflow: dict) -> dict:
    node = None
    for nid in ("2", "3"):
        cand = workflow.get(nid)
        if isinstance(cand, dict) and cand.get("class_type") == "KSampler":
            node = cand
            break
    if node is None:
        for n in workflow.values():
            if isinstance(n, dict) and n.get("class_type") == "KSampler":
                node = n
                break
    if node is None:
        raise ValueError("KSampler node missing in qwen-image-2.1 workflow")
    return node.setdefault("inputs", {})


def _tune_sampler(inputs: dict, seed: Optional[int], steps: Optional[int]) -> None:
    if seed is not None:
        inputs["seed"] = int(seed)
    inputs["steps"] = max(1, min(100, int(steps or DEFAULT_STEPS)))
    inputs["cfg"] = DEFAULT_CFG
    if DEFAULT_SAMPLER:
        inputs["sampler_name"] = DEFAULT_SAMPLER
    if DEFAULT_SCHEDULER:
        inputs["scheduler"] = DEFAULT_SCHEDULER


def build_t2i_workflow(
    server_address: str,
    workflow_dir: str,
    prompt_text: str,
    seed: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    negative_text: Optional[str] = None,
    steps: Optional[int] = None,
) -> dict:
    """Qwen-Image-2.1 文生图工作流。"""
    wf = _load_workflow(workflow_dir, "qwen_image_21_t2i.json")
    wf = _apply_weights(wf, require_weights(server_address), _resolve_clip_type(server_address))

    pos = wf.get("6")
    if not isinstance(pos, dict) or pos.get("class_type") != "CLIPTextEncode":
        raise ValueError("positive CLIPTextEncode node missing in qwen-image-2.1 t2i workflow")
    pos["inputs"]["text"] = prompt_text or ""
    if negative_text is not None and isinstance(wf.get("7"), dict):
        wf["7"].setdefault("inputs", {})["text"] = negative_text

    _tune_sampler(_ksampler_inputs(wf), seed, steps)

    if width is not None and height is not None and isinstance(wf.get("13"), dict):
        lat = wf["13"].setdefault("inputs", {})
        lat["width"] = int(width)
        lat["height"] = int(height)
    return wf


def build_img2img_workflow(
    server_address: str,
    workflow_dir: str,
    prompt_text: str,
    comfy_image_filename: str,
    seed: Optional[int] = None,
    megapixels: Optional[float] = None,
    steps: Optional[int] = None,
    negative_text: Optional[str] = None,
) -> dict:
    """Qwen-Image-2.1 指令改图工作流（单参考图形态）。"""
    wf = _load_workflow(workflow_dir, "qwen_image_21_img2img.json")
    wf = _apply_weights(wf, require_weights(server_address), _resolve_clip_type(server_address))

    loader = wf.get("7")
    if not isinstance(loader, dict) or loader.get("class_type") != "LoadImage":
        raise ValueError("LoadImage node missing in qwen-image-2.1 img2img workflow")
    loader["inputs"]["image"] = comfy_image_filename
    loader["inputs"]["upload"] = "image"

    enc = wf.get("81")
    if not isinstance(enc, dict) or enc.get("class_type") != "TextEncodeQwenImageEdit":
        raise ValueError(
            "TextEncodeQwenImageEdit node missing in qwen-image-2.1 img2img workflow"
        )
    enc["inputs"]["prompt"] = (prompt_text or "").strip()

    neg = wf.get("27")
    if (
        negative_text is not None
        and isinstance(neg, dict)
        and neg.get("class_type") == "TextEncodeQwenImageEdit"
    ):
        neg.setdefault("inputs", {})["prompt"] = (negative_text or "").strip()

    _tune_sampler(_ksampler_inputs(wf), seed, steps)

    try:
        mp = float(megapixels if megapixels is not None else DEFAULT_MEGAPIXELS)
    except (TypeError, ValueError):
        mp = DEFAULT_MEGAPIXELS
    mp = max(0.35, min(2.0, mp))
    for node in wf.values():
        if isinstance(node, dict) and node.get("class_type") == "ImageScaleToTotalPixels":
            ins = node.setdefault("inputs", {})
            ins["megapixels"] = mp
            ins.setdefault("resolution_steps", 1)
    return wf
