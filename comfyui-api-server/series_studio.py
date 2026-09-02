"""
剧集分层流水线（MVP）：
  剧项目 → 集(episode) → 场(scene) → 镜(shot)
  SQLite 持久化 + 单镜生成 / 继续全自动 / 继续到指定镜 / 重跑。
  UI 中文默认：集 / 场 / 镜。
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import shutil
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from PIL import Image

from trailer_pipeline import (
    _ASPECT_I2V,
    _ASPECT_LTX,
    _ASPECT_SIZES,
    _ASPECT_VIDEO,
    _VIDEO_ENGINES,
    _build_shot_motion_prompt,
    _clamp_shot_duration,
    _compose_clips_with_audio_sync,
    _compose_trailer_sync,
    _ensure_wav,
    _extract_json_object,
    _format_elapsed,
    _length_for_duration,
    _normalize_aspect,
    _normalize_bible,
    _normalize_video_engine,
    _pad_or_trim_wav,
    _style_meta,
    _write_silence_wav,
)

try:
    from zoneinfo import ZoneInfo

    _CN_TZ = ZoneInfo("Asia/Shanghai")
except Exception:
    _CN_TZ = timezone(timedelta(hours=8))

_SHOT_STATUSES = (
    "planned",
    "stills",
    "video",
    "vo",
    "done",
    "failed",
    "approved",
)


def _utc_now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _display_now() -> str:
    return datetime.now(_CN_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _utc_to_cn_display(utc_s: str) -> str:
    """UTC naive `YYYY-MM-DD HH:MM:SS` → 北京时间同格式。"""
    s = (utc_s or "").strip()
    if not s:
        return ""
    try:
        dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt.astimezone(_CN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s


def _elapsed_since_utc(utc_s: str) -> float:
    s = (utc_s or "").strip()
    if not s:
        return 0.0
    try:
        dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return 0.0


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}" if prefix else uuid.uuid4().hex[:16]


class SeriesDB:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS series (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  synopsis TEXT NOT NULL DEFAULT '',
                  visual_style TEXT NOT NULL DEFAULT 'realistic',
                  aspect TEXT NOT NULL DEFAULT '16_9',
                  voice TEXT NOT NULL DEFAULT 'zh-CN-YunxiNeural',
                  speed REAL NOT NULL DEFAULT 1.0,
                  shot_duration_sec REAL NOT NULL DEFAULT 5.0,
                  video_mode TEXT NOT NULL DEFAULT 'wan22_5b',
                  episode_count INTEGER NOT NULL DEFAULT 1,
                  scenes_per_ep INTEGER NOT NULL DEFAULT 1,
                  shots_per_scene INTEGER NOT NULL DEFAULT 1,
                  bible_json TEXT NOT NULL DEFAULT '{}',
                  global_refs_json TEXT NOT NULL DEFAULT '[]',
                  status TEXT NOT NULL DEFAULT 'draft',
                  cursor_shot_id TEXT,
                  job_status TEXT NOT NULL DEFAULT 'idle',
                  job_error TEXT NOT NULL DEFAULT '',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS episode (
                  id TEXT PRIMARY KEY,
                  series_id TEXT NOT NULL,
                  ep_no INTEGER NOT NULL,
                  title TEXT NOT NULL DEFAULT '',
                  summary TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'planned',
                  UNIQUE(series_id, ep_no),
                  FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS scene (
                  id TEXT PRIMARY KEY,
                  series_id TEXT NOT NULL,
                  episode_id TEXT NOT NULL,
                  sc_no INTEGER NOT NULL,
                  title TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'planned',
                  UNIQUE(episode_id, sc_no),
                  FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
                  FOREIGN KEY(episode_id) REFERENCES episode(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS shot (
                  id TEXT PRIMARY KEY,
                  series_id TEXT NOT NULL,
                  episode_id TEXT NOT NULL,
                  scene_id TEXT NOT NULL,
                  shot_no INTEGER NOT NULL,
                  voiceover TEXT NOT NULL DEFAULT '',
                  visual_prompt TEXT NOT NULL DEFAULT '',
                  camera TEXT NOT NULL DEFAULT 'medium',
                  duration_sec REAL NOT NULL DEFAULT 5.0,
                  status TEXT NOT NULL DEFAULT 'planned',
                  version INTEGER NOT NULL DEFAULT 1,
                  image_rel TEXT NOT NULL DEFAULT '',
                  clip_rel TEXT NOT NULL DEFAULT '',
                  audio_rel TEXT NOT NULL DEFAULT '',
                  error TEXT NOT NULL DEFAULT '',
                  updated_at TEXT NOT NULL,
                  UNIQUE(scene_id, shot_no),
                  FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
                  FOREIGN KEY(episode_id) REFERENCES episode(id) ON DELETE CASCADE,
                  FOREIGN KEY(scene_id) REFERENCES scene(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS series_log (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  series_id TEXT NOT NULL,
                  msg TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_shot_series ON shot(series_id);
                CREATE INDEX IF NOT EXISTS idx_log_series ON series_log(series_id);
                """
            )
            self._ensure_columns(
                conn,
                "shot",
                {
                    "started_at": "TEXT NOT NULL DEFAULT ''",
                    "finished_at": "TEXT NOT NULL DEFAULT ''",
                    "stills_sec": "REAL NOT NULL DEFAULT 0",
                    "video_sec": "REAL NOT NULL DEFAULT 0",
                    "total_sec": "REAL NOT NULL DEFAULT 0",
                },
            )

    @staticmethod
    def _ensure_columns(conn: sqlite3.Connection, table: str, cols: Dict[str, str]) -> None:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, decl in cols.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def deepseek_series_plan(
    synopsis: str,
    title_hint: str,
    visual_style: str,
    aspect: str,
    shot_duration: float,
    episode_count: int,
    scenes_per_ep: int,
    shots_per_scene: int,
    api_key: str,
    api_url: str,
) -> Optional[dict]:
    if not api_key:
        return None
    style = _style_meta(visual_style)
    aspect_label = "横屏 16:9" if aspect == "16_9" else "竖屏 9:16"
    dur = _clamp_shot_duration(shot_duration)
    ep_n = max(1, min(12, int(episode_count)))
    sc_n = max(1, min(8, int(scenes_per_ep)))
    sh_n = max(1, min(12, int(shots_per_scene)))
    user_prompt = f"""你是长剧分镜导演。请把用户故事拆成「集 → 场 → 镜」结构，供 AI 逐镜生成视频。

【剧名提示】{title_hint or "（从梗概提炼）"}
【梗概】
{synopsis.strip()}

【画面风格】{style['label']}（{style['zh']}）
【画幅】{aspect_label}
【单镜时长】约 {dur:g} 秒
【规模】严格 {ep_n} 集；每集严格 {sc_n} 场；每场严格 {sh_n} 镜（不得多写，不得少写）。

请输出严格 JSON（不要 markdown）：
{{
  "title": "剧名",
  "logline": "一句话卖点",
  "bible": {{
    "style_notes": "英文全剧画风",
    "world_look": "英文世界观风貌",
    "palette": "英文色调",
    "mood": "英文整体情绪",
    "relationships": "中文或英文人物关系",
    "characters": [{{"id":"c1","name":"角色名","look":"英文外形","role":"身份"}}],
    "ref_prompts": ["英文定妆/情绪板提示1","…共6条，含主角定妆与场景情绪板"]
  }},
  "episodes": [
    {{
      "ep_no": 1,
      "title": "第1集标题",
      "summary": "本集摘要",
      "scenes": [
        {{
          "sc_no": 1,
          "title": "场标题",
          "shots": [
            {{
              "shot_no": 1,
              "voiceover": "中文旁白，适合约{dur:g}秒口述",
              "visual_prompt": "英文文生图提示：主体动作环境光影景别，符合 bible",
              "camera": "medium|close-up|wide|..."
            }}
          ]
        }}
      ]
    }}
  ]
}}

规则：
1. 集/场/镜编号从 1 开始连续。
2. visual_prompt 必须用英文，且足够具体：至少 35 个英文单词，写清主体是谁、动作、环境、光线、景别/镜头运动；每镜画面差异要大，禁止空泛套话。voiceover 中文一句即可。不要字幕/水印描述。
3. 用户未细写画风时，由 bible 完整定调并贯穿所有 visual_prompt。
4. episodes 数组长度必须等于 {ep_n}；每集 scenes 长度必须等于 {sc_n}；每场 shots 长度必须等于 {sh_n}。禁止多写。
5. ref_prompts 必须给满 6 条英文提示：优先各主角单独定妆/半身+全身，再补场景情绪板；外形与 characters 一致。
6. 本集若是动作戏，至少一半镜头要有明确动作/冲突，不要只会「站桩合影」。
"""
    try:
        import requests

        r = requests.post(
            api_url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You output only valid JSON for TV series breakdown."},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.7,
            },
            timeout=180,
        )
        r.raise_for_status()
        content = (((r.json() or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        obj = _extract_json_object(content)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _fallback_series_plan(
    synopsis: str,
    title_hint: str,
    shot_duration: float,
    episode_count: int,
    scenes_per_ep: int,
    shots_per_scene: int,
) -> dict:
    dur = _clamp_shot_duration(shot_duration)
    ep_n = max(1, min(12, int(episode_count)))
    sc_n = max(1, min(8, int(scenes_per_ep)))
    sh_n = max(1, min(12, int(shots_per_scene)))
    title = (title_hint or synopsis.strip()[:24] or "未命名剧集").strip()
    bible = _normalize_bible({}, synopsis)
    episodes = []
    for ei in range(1, ep_n + 1):
        scenes = []
        for si in range(1, sc_n + 1):
            shots = []
            for hi in range(1, sh_n + 1):
                shots.append(
                    {
                        "shot_no": hi,
                        "voiceover": f"第{ei}集第{si}场第{hi}镜：{synopsis.strip()[:40] or '故事推进'}",
                        "visual_prompt": (
                            f"cinematic shot ep{ei} sc{si} sh{hi} for story: "
                            f"{synopsis.strip()[:120]}, consistent cast, no text"
                        ),
                        "camera": "medium",
                    }
                )
            scenes.append({"sc_no": si, "title": f"第{si}场", "shots": shots})
        episodes.append(
            {
                "ep_no": ei,
                "title": f"第{ei}集",
                "summary": synopsis.strip()[:120],
                "scenes": scenes,
            }
        )
    return {
        "title": title,
        "logline": synopsis.strip()[:160],
        "bible": bible,
        "episodes": episodes,
        "source": "fallback",
        "shot_duration_sec": dur,
    }


def _normalize_series_plan(
    obj: dict,
    synopsis: str,
    shot_duration: float,
    episode_count: int = 12,
    scenes_per_ep: int = 8,
    shots_per_scene: int = 12,
) -> dict:
    dur = _clamp_shot_duration(shot_duration)
    ep_cap = max(1, min(12, int(episode_count or 12)))
    sc_cap = max(1, min(8, int(scenes_per_ep or 8)))
    sh_cap = max(1, min(12, int(shots_per_scene or 12)))
    title = str(obj.get("title") or "").strip() or (synopsis.strip()[:40] or "未命名剧集")
    logline = str(obj.get("logline") or "").strip() or synopsis.strip()[:160]
    bible = _normalize_bible(obj, synopsis)
    episodes_out = []
    raw_eps = obj.get("episodes") if isinstance(obj.get("episodes"), list) else []
    for ei, ep in enumerate(raw_eps[:ep_cap], start=1):
        if not isinstance(ep, dict):
            continue
        ep_no = int(ep.get("ep_no") or ei)
        scenes_out = []
        raw_scs = ep.get("scenes") if isinstance(ep.get("scenes"), list) else []
        for si, sc in enumerate(raw_scs[:sc_cap], start=1):
            if not isinstance(sc, dict):
                continue
            sc_no = int(sc.get("sc_no") or si)
            shots_out = []
            raw_sh = sc.get("shots") if isinstance(sc.get("shots"), list) else []
            for hi, sh in enumerate(raw_sh[:sh_cap], start=1):
                if not isinstance(sh, dict):
                    continue
                vo = str(sh.get("voiceover") or sh.get("narration") or "").strip()
                vis = str(sh.get("visual_prompt") or sh.get("prompt") or "").strip()
                if not vo and not vis:
                    continue
                shots_out.append(
                    {
                        "shot_no": int(sh.get("shot_no") or hi),
                        "voiceover": vo or f"镜头 {hi}",
                        "visual_prompt": vis or f"cinematic shot: {vo[:100]}",
                        "camera": str(sh.get("camera") or "medium").strip()[:32],
                        "duration_sec": dur,
                    }
                )
            if not shots_out:
                continue
            for i, s in enumerate(shots_out, start=1):
                s["shot_no"] = i
            scenes_out.append(
                {
                    "sc_no": sc_no,
                    "title": str(sc.get("title") or f"第{sc_no}场").strip()[:80],
                    "shots": shots_out,
                }
            )
        if not scenes_out:
            continue
        for i, s in enumerate(scenes_out, start=1):
            s["sc_no"] = i
        episodes_out.append(
            {
                "ep_no": ep_no,
                "title": str(ep.get("title") or f"第{ep_no}集").strip()[:80],
                "summary": str(ep.get("summary") or "").strip()[:400],
                "scenes": scenes_out,
            }
        )
    if not episodes_out:
        return _fallback_series_plan(synopsis, title, dur, ep_cap, sc_cap, sh_cap)
    for i, e in enumerate(episodes_out, start=1):
        e["ep_no"] = i
    return {
        "title": title,
        "logline": logline,
        "bible": bible,
        "episodes": episodes_out,
        "source": obj.get("source") or "deepseek",
        "shot_duration_sec": dur,
    }


class SeriesStudioAPI:
    def __init__(self, **deps: Any):
        self.deps = deps
        root: Path = Path(deps["output_root"])
        self.output_root = root
        self.series_root = root / "series"
        self.series_root.mkdir(parents=True, exist_ok=True)
        db_path = Path(deps.get("db_path") or (root.parent / "data" / "series_studio.db"))
        self.db = SeriesDB(db_path)
        self._locks: Dict[str, asyncio.Lock] = {}
        self._cancel: Dict[str, bool] = {}

    def _lock(self, series_id: str) -> asyncio.Lock:
        if series_id not in self._locks:
            self._locks[series_id] = asyncio.Lock()
        return self._locks[series_id]

    def _series_dir(self, series_id: str) -> Path:
        d = self.series_root / series_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _shot_dir(self, series_id: str, ep_no: int, sc_no: int, shot_no: int, version: int) -> Path:
        d = (
            self._series_dir(series_id)
            / f"ep{ep_no:02d}"
            / f"sc{sc_no:02d}"
            / f"sh{shot_no:02d}"
            / f"v{version}"
        )
        d.mkdir(parents=True, exist_ok=True)
        (d / "images").mkdir(exist_ok=True)
        (d / "clips").mkdir(exist_ok=True)
        (d / "audio").mkdir(exist_ok=True)
        return d

    def _rel(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.output_root)).replace("\\", "/")
        except Exception:
            return str(path).replace("\\", "/")

    def _url(self, rel: str) -> str:
        if not rel:
            return ""
        return f"/output/{rel.lstrip('/')}"

    def _thumb_rel_for(self, image_rel: str) -> str:
        """foo/images/00.png -> foo/images/00.thumb.jpg"""
        rel = (image_rel or "").replace("\\", "/").lstrip("/")
        if not rel:
            return ""
        p = Path(rel)
        return str(p.with_name(p.stem + ".thumb.jpg")).replace("\\", "/")

    def _ensure_image_thumb(self, image_rel: str, *, max_side: int = 480) -> str:
        """按需生成 JPEG 缩略图，返回 thumb 相对路径；失败时回退原图 rel。"""
        rel = (image_rel or "").replace("\\", "/").lstrip("/")
        if not rel:
            return ""
        src = self.output_root / rel
        if not src.is_file():
            return ""
        thumb_rel = self._thumb_rel_for(rel)
        thumb = self.output_root / thumb_rel
        try:
            if thumb.is_file() and thumb.stat().st_mtime >= src.stat().st_mtime:
                return thumb_rel
            with Image.open(src) as im:
                im = im.convert("RGB")
                im.thumbnail((int(max_side), int(max_side)), Image.Resampling.LANCZOS)
                thumb.parent.mkdir(parents=True, exist_ok=True)
                im.save(thumb, format="JPEG", quality=82, optimize=True)
            return thumb_rel
        except Exception:
            return rel

    def _image_urls(self, image_rel: str) -> tuple:
        full = self._url(image_rel)
        if not full:
            return "", ""
        thumb_rel = self._ensure_image_thumb(image_rel)
        return full, self._url(thumb_rel) if thumb_rel else full

    def _enrich_ref_urls(self, refs: list) -> list:
        out = []
        for it in refs or []:
            if not isinstance(it, dict):
                continue
            item = dict(it)
            rel = (item.get("rel") or "").strip().replace("\\", "/")
            if rel:
                full_u, thumb_u = self._image_urls(rel)
                if full_u:
                    item["url"] = full_u
                if thumb_u:
                    item["thumb_url"] = thumb_u
            elif item.get("url") and not item.get("thumb_url"):
                # 只有 url 时尽量从 /output/xxx 反推 rel
                u = str(item.get("url") or "")
                marker = "/output/"
                if marker in u:
                    rel2 = u.split(marker, 1)[1].split("?", 1)[0]
                    full_u, thumb_u = self._image_urls(rel2)
                    if thumb_u:
                        item["thumb_url"] = thumb_u
            out.append(item)
        return out


    def _log(self, series_id: str, msg: str) -> None:
        line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO series_log(series_id, msg, created_at) VALUES (?,?,?)",
                (series_id, line, _utc_now_str()),
            )
            # 保留最近 800 条
            conn.execute(
                """
                DELETE FROM series_log WHERE series_id=? AND id NOT IN (
                  SELECT id FROM series_log WHERE series_id=? ORDER BY id DESC LIMIT 800
                )
                """,
                (series_id, series_id),
            )
        # 同步落盘，便于导出给排查
        try:
            log_path = self._series_dir(series_id) / "pipeline.log"
            with log_path.open("a", encoding="utf-8") as fp:
                fp.write(line + "\n")
        except Exception:
            pass

    def _reveal_path(self, path: Path) -> str:
        resolved = str(Path(path).resolve())
        try:
            import subprocess
            import sys

            if sys.platform.startswith("win"):
                subprocess.Popen(["explorer", resolved])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", resolved])
            else:
                subprocess.Popen(["xdg-open", resolved])
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        return resolved

    def _export_log_text(self, series_id: str) -> str:
        disk = self._series_dir(series_id) / "pipeline.log"
        if disk.is_file() and disk.stat().st_size > 0:
            try:
                return disk.read_text(encoding="utf-8")
            except Exception:
                pass
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT msg FROM series_log WHERE series_id=? ORDER BY id ASC",
                (series_id,),
            ).fetchall()
        return "\n".join(r["msg"] for r in rows) + ("\n" if rows else "")

    def _get_series_row(self, conn: sqlite3.Connection, series_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM series WHERE id=?", (series_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="剧项目不存在")
        return row

    def _tree(self, series_id: str) -> dict:
        with self.db.connect() as conn:
            s = self._get_series_row(conn, series_id)
            eps = conn.execute(
                "SELECT * FROM episode WHERE series_id=? ORDER BY ep_no", (series_id,)
            ).fetchall()
            scenes = conn.execute(
                "SELECT * FROM scene WHERE series_id=? ORDER BY episode_id, sc_no", (series_id,)
            ).fetchall()
            shots = conn.execute(
                "SELECT * FROM shot WHERE series_id=? ORDER BY episode_id, scene_id, shot_no",
                (series_id,),
            ).fetchall()
            logs = conn.execute(
                "SELECT msg FROM series_log WHERE series_id=? ORDER BY id DESC LIMIT 200",
                (series_id,),
            ).fetchall()

        sc_by_ep: Dict[str, List] = {}
        for sc in scenes:
            sc_by_ep.setdefault(sc["episode_id"], []).append(sc)
        sh_by_sc: Dict[str, List] = {}
        for sh in shots:
            sh_by_sc.setdefault(sh["scene_id"], []).append(sh)

        ep_nos = {e["id"]: e["ep_no"] for e in eps}
        sc_nos = {sc["id"]: sc["sc_no"] for sc in scenes}

        episodes = []
        done_n = 0
        total_n = 0
        for e in eps:
            sc_list = []
            for sc in sc_by_ep.get(e["id"], []):
                sh_list = []
                for sh in sh_by_sc.get(sc["id"], []):
                    total_n += 1
                    if sh["status"] in ("done", "approved"):
                        done_n += 1
                    started_utc = ""
                    finished_utc = ""
                    try:
                        started_utc = str(sh["started_at"] or "")
                    except (KeyError, IndexError):
                        started_utc = ""
                    try:
                        finished_utc = str(sh["finished_at"] or "")
                    except (KeyError, IndexError):
                        finished_utc = ""
                    try:
                        stills_sec = float(sh["stills_sec"] or 0)
                    except (KeyError, IndexError, TypeError, ValueError):
                        stills_sec = 0.0
                    try:
                        video_sec = float(sh["video_sec"] or 0)
                    except (KeyError, IndexError, TypeError, ValueError):
                        video_sec = 0.0
                    try:
                        total_sec = float(sh["total_sec"] or 0)
                    except (KeyError, IndexError, TypeError, ValueError):
                        total_sec = 0.0
                    if total_sec <= 0 and sh["status"] in ("stills", "video", "vo") and started_utc:
                        total_sec = _elapsed_since_utc(started_utc)
                    elapsed_label = _format_elapsed(total_sec) if total_sec > 0 else ""
                    img_full, img_thumb = self._image_urls(sh["image_rel"])
                    sh_list.append(
                        {
                            "id": sh["id"],
                            "shot_no": sh["shot_no"],
                            "voiceover": sh["voiceover"],
                            "visual_prompt": sh["visual_prompt"],
                            "camera": sh["camera"],
                            "duration_sec": sh["duration_sec"],
                            "status": sh["status"],
                            "version": sh["version"],
                            "error": sh["error"],
                            "image_url": img_full,
                            "image_thumb_url": img_thumb,
                            "clip_url": self._url(sh["clip_rel"]),
                            "audio_url": self._url(sh["audio_rel"]),
                            "label": f"第{e['ep_no']}集 · 第{sc['sc_no']}场 · 第{sh['shot_no']}镜",
                            "ep_no": e["ep_no"],
                            "sc_no": sc["sc_no"],
                            "started_at": _utc_to_cn_display(started_utc),
                            "finished_at": _utc_to_cn_display(finished_utc),
                            "stills_sec": round(stills_sec, 1) if stills_sec else 0,
                            "video_sec": round(video_sec, 1) if video_sec else 0,
                            "total_sec": round(total_sec, 1) if total_sec else 0,
                            "elapsed_label": elapsed_label,
                            "stills_label": _format_elapsed(stills_sec) if stills_sec > 0 else "",
                            "video_label": _format_elapsed(video_sec) if video_sec > 0 else "",
                        }
                    )
                sc_list.append(
                    {
                        "id": sc["id"],
                        "sc_no": sc["sc_no"],
                        "title": sc["title"],
                        "status": sc["status"],
                        "shots": sh_list,
                    }
                )
            episodes.append(
                {
                    "id": e["id"],
                    "ep_no": e["ep_no"],
                    "title": e["title"],
                    "summary": e["summary"],
                    "status": e["status"],
                    "scenes": sc_list,
                }
            )

        bible = {}
        try:
            bible = json.loads(s["bible_json"] or "{}")
        except Exception:
            bible = {}
        refs = []
        try:
            refs = json.loads(s["global_refs_json"] or "[]")
        except Exception:
            refs = []
        refs = self._enrich_ref_urls(refs)

        return {
            "id": s["id"],
            "title": s["title"],
            "synopsis": s["synopsis"],
            "visual_style": s["visual_style"],
            "aspect": s["aspect"],
            "voice": s["voice"],
            "speed": s["speed"],
            "shot_duration_sec": s["shot_duration_sec"],
            "video_mode": s["video_mode"],
            "episode_count": s["episode_count"],
            "scenes_per_ep": s["scenes_per_ep"],
            "shots_per_scene": s["shots_per_scene"],
            "status": s["status"],
            "job_status": s["job_status"],
            "job_error": s["job_error"],
            "cursor_shot_id": s["cursor_shot_id"],
            "bible": bible,
            "global_refs": refs,
            "episodes": episodes,
            "progress": {"done": done_n, "total": total_n},
            "logs": [r["msg"] for r in reversed(logs)],
            "labels": {"l1": "集", "l2": "场", "l3": "镜"},
            "created_at": s["created_at"],
            "updated_at": s["updated_at"],
        }

    def _list_series(self) -> List[dict]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT id, title, synopsis, status, job_status, updated_at, created_at FROM series ORDER BY updated_at DESC LIMIT 50"
            ).fetchall()
            out = []
            for r in rows:
                total = conn.execute(
                    "SELECT COUNT(*) AS c FROM shot WHERE series_id=?", (r["id"],)
                ).fetchone()["c"]
                done = conn.execute(
                    "SELECT COUNT(*) AS c FROM shot WHERE series_id=? AND status IN ('done','approved')",
                    (r["id"],),
                ).fetchone()["c"]
                out.append(
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "synopsis": (r["synopsis"] or "")[:120],
                        "status": r["status"],
                        "job_status": r["job_status"],
                        "progress": {"done": done, "total": total},
                        "updated_at": r["updated_at"],
                        "created_at": r["created_at"],
                    }
                )
            return out

    def _replace_tree_from_plan(self, series_id: str, plan: dict) -> None:
        dur = _clamp_shot_duration(plan.get("shot_duration_sec") or 5)
        bible = plan.get("bible") if isinstance(plan.get("bible"), dict) else {}
        now = _utc_now_str()
        with self.db.connect() as conn:
            conn.execute("DELETE FROM shot WHERE series_id=?", (series_id,))
            conn.execute("DELETE FROM scene WHERE series_id=?", (series_id,))
            conn.execute("DELETE FROM episode WHERE series_id=?", (series_id,))
            conn.execute(
                """
                UPDATE series SET title=?, bible_json=?, status=?, shot_duration_sec=?,
                  updated_at=?, cursor_shot_id=NULL, job_error=''
                WHERE id=?
                """,
                (
                    plan.get("title") or "未命名剧集",
                    json.dumps(bible, ensure_ascii=False),
                    "planned",
                    dur,
                    now,
                    series_id,
                ),
            )
            for ep in plan.get("episodes") or []:
                ep_id = _new_id("ep_")
                conn.execute(
                    """
                    INSERT INTO episode(id, series_id, ep_no, title, summary, status)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (
                        ep_id,
                        series_id,
                        int(ep["ep_no"]),
                        ep.get("title") or f"第{ep['ep_no']}集",
                        ep.get("summary") or "",
                        "planned",
                    ),
                )
                for sc in ep.get("scenes") or []:
                    sc_id = _new_id("sc_")
                    conn.execute(
                        """
                        INSERT INTO scene(id, series_id, episode_id, sc_no, title, status)
                        VALUES (?,?,?,?,?,?)
                        """,
                        (
                            sc_id,
                            series_id,
                            ep_id,
                            int(sc["sc_no"]),
                            sc.get("title") or f"第{sc['sc_no']}场",
                            "planned",
                        ),
                    )
                    for sh in sc.get("shots") or []:
                        sh_id = _new_id("sh_")
                        conn.execute(
                            """
                            INSERT INTO shot(
                              id, series_id, episode_id, scene_id, shot_no,
                              voiceover, visual_prompt, camera, duration_sec,
                              status, version, updated_at
                            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                            """,
                            (
                                sh_id,
                                series_id,
                                ep_id,
                                sc_id,
                                int(sh["shot_no"]),
                                sh.get("voiceover") or "",
                                sh.get("visual_prompt") or "",
                                sh.get("camera") or "medium",
                                float(sh.get("duration_sec") or dur),
                                "planned",
                                1,
                                now,
                            ),
                        )
        # 落盘 plan.json
        plan_path = self._series_dir(series_id) / "plan.json"
        plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    def _ordered_shots(self, series_id: str) -> List[sqlite3.Row]:
        with self.db.connect() as conn:
            return conn.execute(
                """
                SELECT sh.*, e.ep_no, sc.sc_no
                FROM shot sh
                JOIN episode e ON e.id = sh.episode_id
                JOIN scene sc ON sc.id = sh.scene_id
                WHERE sh.series_id=?
                ORDER BY e.ep_no, sc.sc_no, sh.shot_no
                """,
                (series_id,),
            ).fetchall()

    def _shot_detail(self, series_id: str, shot_id: str) -> sqlite3.Row:
        with self.db.connect() as conn:
            row = conn.execute(
                """
                SELECT sh.*, e.ep_no, sc.sc_no, s.visual_style, s.aspect, s.voice, s.speed,
                       s.video_mode, s.bible_json, s.global_refs_json, s.title AS series_title
                FROM shot sh
                JOIN episode e ON e.id = sh.episode_id
                JOIN scene sc ON sc.id = sh.scene_id
                JOIN series s ON s.id = sh.series_id
                WHERE sh.series_id=? AND sh.id=?
                """,
                (series_id, shot_id),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="镜不存在")
            return row

    def _set_job(self, series_id: str, status: str, error: str = "") -> None:
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE series SET job_status=?, job_error=?, updated_at=? WHERE id=?",
                (status, error, _utc_now_str(), series_id),
            )

    def _update_shot(self, shot_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = _utc_now_str()
        cols = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [shot_id]
        with self.db.connect() as conn:
            conn.execute(f"UPDATE shot SET {cols} WHERE id=?", vals)

    def _ref_disk_path(self, series_id: str, item: dict) -> Optional[Path]:
        if not isinstance(item, dict):
            return None
        rel = (item.get("rel") or "").strip().replace("\\", "/")
        if rel:
            p = self.output_root / rel
            if p.is_file():
                return p
        fn = Path(str(item.get("filename") or "")).name
        if not fn:
            return None
        p2 = self._series_dir(series_id) / "global_refs" / fn
        return p2 if p2.is_file() else None

    async def _still_from_prompt(
        self,
        *,
        series_id: str,
        pos: str,
        neg: str,
        width: int,
        height: int,
        selected_refs: List[dict],
    ) -> Tuple[bytes, str]:
        """分镜静帧默认文生图，按 bible/提示词构图。

        全剧参考图只用于人物外形与画风一致性（写进提示词）；
        不再用定妆合影做强图生图，否则每镜都会锁成「参考图里的一排人」。
        仅当环境变量 SERIES_REF_STYLE_IMG2IMG=1 时，才用极高 denoise 轻量蹭风格。
        """
        import os

        build_txt = self.deps["build_z_image_workflow"]
        build_i2i = self.deps.get("build_z_image_img2img_workflow")
        run_comfy = self.deps["run_comfyui_and_get_last_image"]
        upload_bytes = self.deps.get("upload_image_bytes")
        seed = random.randint(1, 2_000_000_000)

        use_style_i2i = str(os.environ.get("SERIES_REF_STYLE_IMG2IMG", "0")).strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

        primary = None
        if use_style_i2i:
            for it in selected_refs:
                path = self._ref_disk_path(series_id, it)
                if path:
                    primary = (it, path)
                    break

        if primary and callable(build_i2i) and callable(upload_bytes):
            it, path = primary
            try:
                comfy_name, _sub = await upload_bytes(
                    path.read_bytes(), name_prefix=f"series_ref_{series_id}_"
                )
                if not comfy_name:
                    raise RuntimeError("参考图上传 ComfyUI 失败")
                i2i_pos = (
                    f"{pos} Borrow only art style, lighting mood and costume color palette "
                    f"from the reference. Compose a NEW scene from the shot prompt; "
                    f"include ONLY characters named in the shot; never copy the reference "
                    f"group lineup, poses or camera."
                )
                wf = build_i2i(
                    i2i_pos,
                    comfy_name,
                    negative_text=neg,
                    seed=seed,
                    # 极高 denoise：几乎丢掉参考构图，只留一点风格倾向
                    denoise=0.93,
                    megapixels=1.0,
                )
                img_bytes = await run_comfy(wf)
                note = f"轻量风格图生图·{it.get('filename')}"
                return img_bytes, note
            except Exception as e:
                self._log(series_id, f"参考风格图生图失败，回退文生图：{e}")

        wf = build_txt(pos, seed=seed, width=width, height=height, negative_text=neg)
        img_bytes = await run_comfy(wf)
        if selected_refs:
            return img_bytes, f"文生图（参考{len(selected_refs)}张仅作文风/角色描述）"
        return img_bytes, "文生图"

    async def _regen_one_global_ref(self, series_id: str, filename: str, feedback: str) -> dict:
        feedback = (feedback or "").strip()
        if len(feedback) < 2:
            raise HTTPException(status_code=400, detail="请填写修改意见")
        safe = Path(filename).name
        with self.db.connect() as conn:
            s = self._get_series_row(conn, series_id)
            if s["job_status"] == "running":
                raise HTTPException(status_code=400, detail="已有任务在跑，请稍候")
            try:
                refs = json.loads(s["global_refs_json"] or "[]")
            except Exception:
                refs = []
            aspect = _normalize_aspect(s["aspect"])
            style_key = s["visual_style"]
            try:
                bible = json.loads(s["bible_json"] or "{}")
            except Exception:
                bible = {}

        idx = -1
        item = None
        for i, it in enumerate(refs):
            if isinstance(it, dict) and it.get("filename") == safe:
                idx = i
                item = dict(it)
                break
        if not item:
            raise HTTPException(status_code=404, detail="参考图不存在")

        w, h = _ASPECT_SIZES[aspect]
        style = _style_meta(style_key)
        no_text = self.deps.get("image_no_text_prefix") or ""
        bible_prefix = _bible_prompt_prefix({"bible": bible})
        neg = self.deps["default_txt2img_negative"]("", width=w, height=h)
        base_prompt = (
            item.get("base_prompt")
            or item.get("prompt")
            or item.get("label")
            or "series character design sheet"
        ).strip()
        # 避免多次「按反馈重出」把 Revision 叠成长串
        if ". Revision:" in base_prompt:
            base_prompt = base_prompt.split(". Revision:")[0].strip()
        if ". User revision:" in base_prompt:
            base_prompt = base_prompt.split(". User revision:")[0].strip()
        pos = (
            f"{no_text}{bible_prefix}{base_prompt}. User revision: {feedback}. "
            f"{style['suffix']}. {style['zh']}. series style guide still, no text, no watermark."
        )

        build_txt = self.deps["build_z_image_workflow"]
        build_i2i = self.deps.get("build_z_image_img2img_workflow")
        build_qwen = self.deps.get("build_qwen_img2img_workflow")
        run_comfy = self.deps["run_comfyui_and_get_last_image"]
        upload_bytes = self.deps.get("upload_image_bytes")
        path = self._ref_disk_path(series_id, item)
        seed = random.randint(1, 2_000_000_000)
        img_bytes = None
        engine = "txt"

        if path and callable(upload_bytes):
            comfy_name, _sub = await upload_bytes(
                path.read_bytes(), name_prefix=f"series_refedit_{series_id}_"
            )
            if comfy_name and callable(build_qwen):
                try:
                    qwen_prompt = (
                        f"Edit this series reference still. Keep framing as a character/mood board. "
                        f"Apply these changes: {feedback}. "
                        f"Preserve overall art style. No text, no watermark."
                    )
                    wf = build_qwen(qwen_prompt, comfy_name, seed=seed, quality="standard")
                    img_bytes = await run_comfy(wf)
                    engine = "qwen_edit"
                except Exception as e:
                    self._log(series_id, f"Qwen 改参考图失败，改用图生图：{e}")
            if img_bytes is None and comfy_name and callable(build_i2i):
                try:
                    wf = build_i2i(
                        pos, comfy_name, negative_text=neg, seed=seed, denoise=0.62, megapixels=1.0
                    )
                    img_bytes = await run_comfy(wf)
                    engine = "z_img2img"
                except Exception as e:
                    self._log(series_id, f"图生图改参考失败，改用文生图：{e}")

        if img_bytes is None:
            wf = build_txt(pos, seed=seed, width=w, height=h, negative_text=neg)
            img_bytes = await run_comfy(wf)
            engine = "txt"

        refs_dir = self._series_dir(series_id) / "global_refs"
        refs_dir.mkdir(parents=True, exist_ok=True)
        out_path = refs_dir / safe
        out_path.write_bytes(img_bytes)
        rel = self._rel(out_path)
        item["rel"] = rel
        full_u, thumb_u = self._image_urls(rel)
        item["url"] = full_u + f"?t={int(time.time())}"
        item["thumb_url"] = (thumb_u + f"?t={int(time.time())}") if thumb_u else item["url"]
        item["base_prompt"] = base_prompt[:500]
        item["prompt"] = f"{base_prompt}. Revision: {feedback}"[:500]
        item["feedback"] = feedback[:300]
        item["selected"] = True
        item["source"] = item.get("source") or "ai"
        item["engine"] = engine
        refs[idx] = item
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE series SET global_refs_json=?, updated_at=? WHERE id=?",
                (json.dumps(refs, ensure_ascii=False), _utc_now_str(), series_id),
            )
        self._log(series_id, f"已按反馈重出参考图 {safe}（{engine}）：{feedback[:80]}")
        return item

    async def _free_comfy_vram(self, series_id: str, reason: str = "") -> None:
        """镜间/阶段间卸模型，避免生图与 LTX 叠占显存导致极慢。"""
        fn = self.deps.get("free_comfyui_memory")
        if not callable(fn):
            return
        try:
            await fn()
            tip = f"（{reason}）" if reason else ""
            self._log(series_id, f"已释放 ComfyUI 显存{tip}")
        except Exception as e:
            self._log(series_id, f"释放显存失败（可忽略）：{e}")

    async def _run_video_with_heartbeat(self, series_id: str, label: str, workflow: dict):
        run_video = self.deps.get("run_comfyui_and_get_last_video")
        if not callable(run_video):
            raise RuntimeError("无视频引擎")
        task = asyncio.create_task(run_video(workflow))
        t0 = time.perf_counter()
        while True:
            done, _pending = await asyncio.wait({task}, timeout=60.0)
            if task in done:
                return task.result()
            self._log(
                series_id,
                f"图生视频进行中 {label}，已等待 {_format_elapsed(time.perf_counter() - t0)}（显存紧张时会明显变慢）",
            )

    async def _run_one_shot(self, series_id: str, shot_id: str, *, force: bool = False) -> None:
        row = self._shot_detail(series_id, shot_id)
        if row["status"] in ("done", "approved") and not force:
            self._log(series_id, f"跳过已完成：第{row['ep_no']}集第{row['sc_no']}场第{row['shot_no']}镜")
            return
        if self._cancel.get(series_id):
            return

        version = int(row["version"] or 1)
        if force and row["status"] not in ("planned",):
            version = version + 1
            self._update_shot(shot_id, version=version, status="planned", error="")

        ep_no, sc_no, shot_no = int(row["ep_no"]), int(row["sc_no"]), int(row["shot_no"])
        label = f"第{ep_no}集 · 第{sc_no}场 · 第{shot_no}镜"
        shot_dir = self._shot_dir(series_id, ep_no, sc_no, shot_no, version)
        aspect = _normalize_aspect(row["aspect"])
        w, h = _ASPECT_SIZES[aspect]
        style = _style_meta(row["visual_style"])
        mode = _normalize_video_engine(row["video_mode"] or "wan22_5b")
        dur = _clamp_shot_duration(row["duration_sec"] or 5)
        bible = {}
        try:
            bible = json.loads(row["bible_json"] or "{}")
        except Exception:
            bible = {}
        plan_stub = {"bible": bible}
        bible_prefix = _bible_prompt_prefix(plan_stub)
        refs = []
        try:
            refs = json.loads(row["global_refs_json"] or "[]")
        except Exception:
            refs = []
        selected_refs = [x for x in refs if isinstance(x, dict) and x.get("selected")]
        ref_note = ""
        if selected_refs:
            ref_note = (
                "Keep character identity, faces, costumes and art style consistent with the series bible "
                f"and approved look references ({len(selected_refs)} sheets). "
                "Compose THIS shot strictly from the shot action/camera below; "
                "include ONLY characters required by this shot; "
                "do NOT copy reference sheet group lineup, poses, or cast count. "
            )

        neg = self.deps["default_txt2img_negative"]("", width=w, height=h)
        if selected_refs:
            neg = (
                f"{neg}, group character lineup, four people standing in a row, "
                "reference sheet collage, cast photo, identical group pose copied from styleboard, "
                "all main characters forced into every frame"
            )
        no_text = self.deps.get("image_no_text_prefix") or ""
        upload_bytes = self.deps.get("upload_image_bytes")
        build_wan_14b = self.deps.get("build_wan22_ti2v_workflow")
        build_wan_5b = self.deps.get("build_wan22_ti2v_5b_workflow")
        build_wan_t2v_5b = self.deps.get("build_wan22_t2v_5b_workflow")
        build_wan_t2v = self.deps.get("build_wan22_t2v_workflow")
        build_ltx_t2v = self.deps.get("build_ltx25_t2v_workflow")
        build_ltx_i2v = self.deps.get("build_ltx25_i2v_workflow")
        run_video = self.deps.get("run_comfyui_and_get_last_video")
        create_subs = self.deps["create_subtitle_overlays_timed"]
        tts = self.deps["indextts_synthesize"]
        wav_dur = self.deps["wav_duration_seconds"]
        audio_dur_fn = self.deps.get("audio_duration_seconds") or wav_dur

        use_wan_14b = (
            mode == "wan22_14b_gguf"
            and callable(upload_bytes)
            and callable(build_wan_14b)
            and callable(run_video)
        )
        use_wan_5b = (
            mode == "wan22_5b"
            and callable(upload_bytes)
            and callable(build_wan_5b)
            and callable(run_video)
        )
        use_wan = use_wan_14b or use_wan_5b
        use_wan_t2v_5b = mode == "wan22_t2v_5b" and callable(build_wan_t2v_5b) and callable(run_video)
        use_wan_t2v = mode == "wan22_t2v_14b" and callable(build_wan_t2v) and callable(run_video)
        use_ltx_i2v = (
            mode == "ltx25_i2v" and callable(upload_bytes) and callable(build_ltx_i2v) and callable(run_video)
        )
        use_ltx_t2v = mode == "ltx25_t2v" and callable(build_ltx_t2v) and callable(run_video)
        use_comfy_video = use_wan or use_wan_t2v_5b or use_wan_t2v or use_ltx_i2v or use_ltx_t2v
        use_tts = use_wan or use_wan_t2v_5b or use_wan_t2v or mode == "kenburns" or not use_comfy_video

        started_at = _utc_now_str()
        stills_sec = 0.0
        video_sec = 0.0
        try:
            # 1) stills
            self._update_shot(
                shot_id,
                status="stills",
                error="",
                started_at=started_at,
                finished_at="",
                stills_sec=0,
                video_sec=0,
                total_sec=0,
            )
            with self.db.connect() as conn:
                conn.execute(
                    "UPDATE series SET cursor_shot_id=?, updated_at=? WHERE id=?",
                    (shot_id, _utc_now_str(), series_id),
                )
            self._log(series_id, f"生图 {label}")
            t0 = time.perf_counter()
            base_prompt = (row["visual_prompt"] or "").strip()
            pos = (
                f"{no_text}{bible_prefix}{ref_note}{base_prompt}. {style['suffix']}. "
                f"{style['zh']}. no text, no watermark, no subtitles, no logo."
            )
            img_bytes, eng_note = await self._still_from_prompt(
                series_id=series_id,
                pos=pos,
                neg=neg,
                width=w,
                height=h,
                selected_refs=selected_refs,
            )
            img_path = shot_dir / "images" / "00.png"
            img_path.write_bytes(img_bytes)
            image_rel = self._rel(img_path)
            self._ensure_image_thumb(image_rel)
            stills_sec = time.perf_counter() - t0
            self._update_shot(shot_id, image_rel=image_rel, stills_sec=round(stills_sec, 2))
            self._log(
                series_id,
                f"生图完成 {label}（{eng_note}），耗时 {_format_elapsed(stills_sec)}",
            )

            if self._cancel.get(series_id):
                return

            # 生图模型与 LTX 叠占显存会极慢：视频前先卸模型
            if use_comfy_video:
                await self._free_comfy_vram(series_id, "生图→视频")

            # 2) video：Wan 用 IndexTTS 旁白；LTX 直出音轨
            self._update_shot(shot_id, status="video")
            clip_path = shot_dir / "clips" / "00.mp4"
            raw_clip = shot_dir / "clips" / "00_raw.mp4"
            clip_dur = min(10.0, max(3.0, float(dur)))
            vo = (row["voiceover"] or "").strip() or label
            mot_col = ""
            try:
                mot_col = (row["motion_prompt"] or "").strip()
            except (KeyError, IndexError):
                pass
            shot_motion = {
                "voiceover": vo,
                "visual_prompt": base_prompt,
                "motion_prompt": mot_col,
                "camera": row["camera"] or "medium",
            }
            motion_i2v = _build_shot_motion_prompt(shot_motion, i2v=True)
            motion_t2v = _build_shot_motion_prompt(shot_motion, i2v=False)
            i2v_wh = _ASPECT_I2V[aspect]
            ltx_wh = _ASPECT_LTX[aspect]
            out_size = _ASPECT_VIDEO[aspect]
            voice = (row["voice"] or "zh-CN-YunxiNeural").strip()
            try:
                speed = max(0.7, min(1.4, float(row["speed"] or 1.0)))
            except Exception:
                speed = 1.0
            t_vid = time.perf_counter()
            made_mp4 = False
            audio_rel = ""
            raw_wav = shot_dir / "audio" / "00_raw.wav"
            final_wav = shot_dir / "audio" / "00.wav"
            tts_len = clip_dur

            if use_tts:
                self._log(series_id, f"配音 {label}")
                produced = await tts(vo, raw_wav, voice=voice, speed=speed)
                produced_path = Path(produced) if produced else raw_wav
                mp3_fallback = raw_wav.with_suffix(".mp3")
                if not raw_wav.exists() or raw_wav.stat().st_size <= 0:
                    src = (
                        produced_path
                        if produced_path.exists()
                        else (mp3_fallback if mp3_fallback.exists() else None)
                    )
                    if src is None:
                        raise RuntimeError(f"配音文件未生成：{raw_wav}")
                    await asyncio.to_thread(_ensure_wav, src, raw_wav)
                tts_len = float(await asyncio.to_thread(audio_dur_fn, raw_wav))
                clip_dur = min(10.0, max(3.0, max(float(dur), tts_len)))

            if use_comfy_video:
                try:
                    if use_wan_14b:
                        length = _length_for_duration(clip_dur)
                        self._log(
                            series_id,
                            f"图生视频 {label}（Wan2.2-14B GGUF · {i2v_wh[0]}×{i2v_wh[1]} · {length}帧）",
                        )
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"series_wan_{series_id}_{shot_no}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传静帧失败")
                        wf = build_wan_14b(
                            comfy_name,
                            motion_i2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=i2v_wh[0],
                            height=i2v_wh[1],
                            length=length,
                            fps=24,
                        )
                    elif use_wan_5b:
                        length = _length_for_duration(clip_dur)
                        self._log(
                            series_id,
                            f"图生视频 {label}（Wan2.2-5B · {i2v_wh[0]}×{i2v_wh[1]} · {length}帧）",
                        )
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"series_wan5b_{series_id}_{shot_no}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传静帧失败")
                        wf = build_wan_5b(
                            comfy_name,
                            motion_i2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=i2v_wh[0],
                            height=i2v_wh[1],
                            length=length,
                            fps=24,
                        )
                    elif use_wan_t2v_5b:
                        length = _length_for_duration(clip_dur)
                        self._log(
                            series_id,
                            f"文生视频 {label}（Wan2.2-5B · {i2v_wh[0]}×{i2v_wh[1]} · {length}帧）",
                        )
                        wf = build_wan_t2v_5b(
                            motion_t2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=i2v_wh[0],
                            height=i2v_wh[1],
                            length=length,
                            fps=24,
                        )
                    elif use_wan_t2v:
                        length = _length_for_duration(clip_dur)
                        self._log(
                            series_id,
                            f"文生视频 {label}（Wan2.2-14B · {i2v_wh[0]}×{i2v_wh[1]} · {length}帧）",
                        )
                        wf = build_wan_t2v(
                            motion_t2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=i2v_wh[0],
                            height=i2v_wh[1],
                            length=length,
                            fps=24,
                        )
                    elif use_ltx_i2v:
                        self._log(series_id, f"图生视频 {label}（LTX·直出音频）")
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"series_ltx_{series_id}_{shot_no}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传静帧失败")
                        wf = build_ltx_i2v(
                            comfy_name,
                            motion_i2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=ltx_wh[0],
                            height=ltx_wh[1],
                            duration_sec=clip_dur,
                            fps=24,
                            strength=0.82,
                        )
                    else:
                        self._log(series_id, f"文生视频 {label}（LTX·直出音频）")
                        wf = build_ltx_t2v(
                            motion_t2v,
                            seed=random.randint(1, 2_000_000_000),
                            width=ltx_wh[0],
                            height=ltx_wh[1],
                            duration_sec=clip_dur,
                            fps=24,
                        )
                    vid_bytes = await self._run_video_with_heartbeat(series_id, label, wf)
                    target = raw_clip if (use_wan or use_wan_t2v_5b or use_wan_t2v) else clip_path
                    target.write_bytes(vid_bytes)
                    made_mp4 = True
                    if use_wan or use_wan_t2v_5b or use_wan_t2v:
                        try:
                            from moviepy.editor import VideoFileClip

                            _vc = VideoFileClip(str(raw_clip))
                            try:
                                vdur = float(_vc.duration)
                            finally:
                                _vc.close()
                        except Exception:
                            vdur = clip_dur
                        clip_dur = max(tts_len, min(10.0, max(vdur, float(dur) * 0.85)))
                        clip_dur = max(3.0, clip_dur)
                    video_sec = time.perf_counter() - t_vid
                    self._log(
                        series_id,
                        f"{'图生' if use_wan or use_ltx_i2v else '文生'}视频完成 {label}，耗时 {_format_elapsed(video_sec)}",
                    )
                except Exception as e:
                    video_sec = time.perf_counter() - t_vid
                    self._log(series_id, f"{label} 视频引擎失败，回退静帧推镜：{e}")

            if use_tts:
                await asyncio.to_thread(_pad_or_trim_wav, raw_wav, final_wav, clip_dur)
                audio_rel = self._rel(final_wav)

            if made_mp4 and (use_wan or use_wan_t2v_5b or use_wan_t2v):
                await asyncio.to_thread(
                    _compose_clips_with_audio_sync,
                    [raw_clip],
                    [final_wav],
                    [clip_dur],
                    clip_path,
                    out_size,
                    [[(vo, 0.0, clip_dur)]],
                    create_subs,
                    24,
                )
            elif not made_mp4:
                if not use_tts:
                    await asyncio.to_thread(_write_silence_wav, final_wav, clip_dur)
                    audio_rel = self._rel(final_wav)
                await asyncio.to_thread(
                    _compose_trailer_sync,
                    [img_path],
                    [final_wav],
                    [clip_dur],
                    clip_path,
                    out_size,
                    [[(vo, 0.0, clip_dur)]],
                    create_subs,
                    25,
                )
                video_sec = time.perf_counter() - t_vid
                self._log(
                    series_id,
                    f"静帧推镜完成 {label}，耗时 {_format_elapsed(video_sec)}",
                )

            clip_rel = self._rel(clip_path)
            total_sec = stills_sec + video_sec
            finished_at = _utc_now_str()
            self._update_shot(
                shot_id,
                status="done",
                image_rel=image_rel,
                clip_rel=clip_rel,
                audio_rel=audio_rel,
                error="",
                duration_sec=clip_dur,
                finished_at=finished_at,
                stills_sec=round(stills_sec, 2),
                video_sec=round(video_sec, 2),
                total_sec=round(total_sec, 2),
            )
            self._log(
                series_id,
                f"完成 {label}（v{version}），总耗时 {_format_elapsed(total_sec)}，"
                f"完成于 {_utc_to_cn_display(finished_at)}",
            )
            self._refresh_parent_status(series_id, row["episode_id"], row["scene_id"])
        except Exception as e:
            self._update_shot(shot_id, status="failed", error=str(e)[:500])
            self._log(series_id, f"失败 {label}：{e}")
            raise
        finally:
            # 下一镜生图前卸掉 LTX，避免显存叠满
            try:
                await self._free_comfy_vram(series_id, "镜结束")
            except Exception:
                pass

    def _refresh_parent_status(self, series_id: str, episode_id: str, scene_id: str) -> None:
        with self.db.connect() as conn:
            for table, key, kid in (
                ("scene", "id", scene_id),
                ("episode", "id", episode_id),
            ):
                if table == "scene":
                    rows = conn.execute(
                        "SELECT status FROM shot WHERE scene_id=?", (scene_id,)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT status FROM shot WHERE episode_id=?", (episode_id,)
                    ).fetchall()
                statuses = [r["status"] for r in rows]
                if not statuses:
                    st = "planned"
                elif all(x in ("done", "approved") for x in statuses):
                    st = "done"
                elif any(x == "failed" for x in statuses):
                    st = "failed"
                elif any(x not in ("planned",) for x in statuses):
                    st = "running"
                else:
                    st = "planned"
                conn.execute(f"UPDATE {table} SET status=? WHERE {key}=?", (st, kid))

            shot_rows = conn.execute(
                "SELECT status FROM shot WHERE series_id=?", (series_id,)
            ).fetchall()
            statuses = [r["status"] for r in shot_rows]
            if statuses and all(x in ("done", "approved") for x in statuses):
                series_st = "done"
            elif any(x not in ("planned",) for x in statuses):
                series_st = "running"
            else:
                series_st = "planned"
            conn.execute(
                "UPDATE series SET status=?, updated_at=? WHERE id=?",
                (series_st, _utc_now_str(), series_id),
            )

    async def _continue_job(
        self,
        series_id: str,
        *,
        until_shot_id: Optional[str] = None,
        only_shot_id: Optional[str] = None,
        force: bool = False,
    ) -> None:
        async with self._lock(series_id):
            self._cancel[series_id] = False
            self._set_job(series_id, "running")
            try:
                if only_shot_id:
                    await self._run_one_shot(series_id, only_shot_id, force=force)
                else:
                    shots = self._ordered_shots(series_id)
                    if not shots:
                        raise RuntimeError("尚无分镜，请先生成剧本结构")
                    for sh in shots:
                        if self._cancel.get(series_id):
                            self._log(series_id, "用户取消任务")
                            break
                        sid = sh["id"]
                        if sh["status"] in ("done", "approved") and not force:
                            if until_shot_id and sid == until_shot_id:
                                break
                            continue
                        await self._run_one_shot(series_id, sid, force=force)
                        if until_shot_id and sid == until_shot_id:
                            break
                self._set_job(series_id, "idle")
            except Exception as e:
                self._set_job(series_id, "error", str(e)[:500])
                self._log(series_id, f"任务失败：{e}")
            finally:
                self._cancel[series_id] = False

    async def _phase_global_refs(self, series_id: str) -> None:
        with self.db.connect() as conn:
            s = self._get_series_row(conn, series_id)
            try:
                bible = json.loads(s["bible_json"] or "{}")
            except Exception:
                bible = {}
            aspect = _normalize_aspect(s["aspect"])
            style_key = s["visual_style"]
            # keep uploads
            try:
                prev = json.loads(s["global_refs_json"] or "[]")
            except Exception:
                prev = []
        uploads = [x for x in prev if isinstance(x, dict) and x.get("source") == "upload"]
        with self.db.connect() as conn:
            syn = self._get_series_row(conn, series_id)["synopsis"]
        prompts = list((bible or {}).get("ref_prompts") or [])[:6]
        if not prompts:
            prompts = _normalize_bible({"bible": bible}, syn).get("ref_prompts") or []
        prompts = list(prompts)[:6]

        w, h = _ASPECT_SIZES[aspect]
        style = _style_meta(style_key)
        build_wf = self.deps["build_z_image_workflow"]
        run_comfy = self.deps["run_comfyui_and_get_last_image"]
        neg = self.deps["default_txt2img_negative"]("", width=w, height=h)
        no_text = self.deps.get("image_no_text_prefix") or ""
        bible_prefix = _bible_prompt_prefix({"bible": bible})
        refs_dir = self._series_dir(series_id) / "global_refs"
        refs_dir.mkdir(parents=True, exist_ok=True)
        ui = list(uploads)
        self._log(series_id, f"生成全剧参考图候选 {len(prompts)} 张…")
        t0 = time.perf_counter()
        for i, rp in enumerate(prompts):
            if self._cancel.get(series_id):
                return
            self._log(series_id, f"全剧参考图 {i + 1}/{len(prompts)}")
            pos = (
                f"{no_text}{bible_prefix}{rp}. {style['suffix']}. "
                f"{style['zh']}. series style guide still, no text, no watermark."
            )
            seed = random.randint(1, 2_000_000_000)
            workflow = build_wf(pos, seed=seed, width=w, height=h, negative_text=neg)
            img_bytes = await run_comfy(workflow)
            name = f"bible_{i:02d}.png"
            (refs_dir / name).write_bytes(img_bytes)
            rel = self._rel(refs_dir / name)
            ui.append(
                {
                    "filename": name,
                    "url": self._image_urls(rel)[0],
                    "thumb_url": self._image_urls(rel)[1],
                    "rel": rel,
                    "source": "ai",
                    "label": f"参考 {i + 1}",
                    "prompt": rp[:500],
                    "base_prompt": rp[:500],
                    "selected": True,
                }
            )
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE series SET global_refs_json=?, status=?, updated_at=? WHERE id=?",
                (json.dumps(ui, ensure_ascii=False), "awaiting_global_refs", _utc_now_str(), series_id),
            )
        self._log(
            series_id,
            f"全剧参考图完成，共 {len(ui)} 张，耗时 {_format_elapsed(time.perf_counter() - t0)}",
        )

    def register(self, app) -> None:
        api = self

        @app.get("/series/list")
        @app.get("/api/series/list")
        async def series_list():
            return {"success": True, "items": api._list_series()}

        @app.post("/series/create")
        @app.post("/api/series/create")
        async def series_create(
            title: str = Form(...),
            synopsis: str = Form(...),
            visual_style: str = Form("realistic"),
            aspect: str = Form("16_9"),
            voice: str = Form("zh-CN-YunxiNeural"),
            speed: str = Form("1.0"),
            shot_duration: str = Form("5"),
            video_mode: str = Form("wan22_5b"),
            episode_count: str = Form("1"),
            scenes_per_ep: str = Form("1"),
            shots_per_scene: str = Form("1"),
        ):
            title_s = (title or "").strip()
            text = (synopsis or "").strip()
            if len(title_s) < 1:
                raise HTTPException(status_code=400, detail="请填写剧名")
            if len(text) < 2:
                raise HTTPException(status_code=400, detail="请填写故事梗概")
            style_n = (visual_style or "realistic").strip().lower()
            if style_n not in ("realistic", "cartoon", "anime", "ink"):
                style_n = "realistic"
            try:
                spd = max(0.7, min(1.4, float(speed or 1.0)))
            except Exception:
                spd = 1.0
            try:
                ep_n = max(1, min(12, int(episode_count or 1)))
                sc_n = max(1, min(8, int(scenes_per_ep or 1)))
                sh_n = max(1, min(12, int(shots_per_scene or 1)))
            except Exception:
                ep_n, sc_n, sh_n = 1, 1, 1
            sid = _new_id("ser_")
            now = _utc_now_str()
            with api.db.connect() as conn:
                conn.execute(
                    """
                    INSERT INTO series(
                      id, title, synopsis, visual_style, aspect, voice, speed,
                      shot_duration_sec, video_mode, episode_count, scenes_per_ep,
                      shots_per_scene, status, job_status, created_at, updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        sid,
                        title_s,
                        text,
                        style_n,
                        _normalize_aspect(aspect),
                        (voice or "zh-CN-YunxiNeural").strip(),
                        spd,
                        _clamp_shot_duration(shot_duration),
                        _normalize_video_engine(video_mode),
                        ep_n,
                        sc_n,
                        sh_n,
                        "draft",
                        "idle",
                        now,
                        now,
                    ),
                )
            api._series_dir(sid)
            api._log(sid, f"立项：{title_s}")
            return {"success": True, "series_id": sid, "series": api._tree(sid)}

        @app.get("/series/get")
        @app.get("/api/series/get")
        async def series_get(series_id: str):
            return {"success": True, "series": api._tree(series_id)}

        @app.get("/series/download-log")
        @app.get("/api/series/download-log")
        async def series_download_log(series_id: str):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
            text = api._export_log_text(series_id)
            if not text.strip():
                text = f"# empty log for {series_id}\n"
            fname = f"series_{series_id}_pipeline.log"
            # RFC 5987：避免中文文件名进 header 触发 500
            return PlainTextResponse(
                text,
                media_type="text/plain; charset=utf-8",
                headers={
                    "Content-Disposition": f"attachment; filename=\"{fname}\"; filename*=UTF-8''{fname}"
                },
            )

        @app.post("/series/reveal-output")
        @app.post("/api/series/reveal-output")
        async def series_reveal_output(series_id: str = Form(...)):
            with api.db.connect() as conn:
                api._get_series_row(conn, series_id)
            path = api._reveal_path(api._series_dir(series_id))
            return {"success": True, "path": path}

        @app.post("/series/reveal-shot")
        @app.post("/api/series/reveal-shot")
        async def series_reveal_shot(
            series_id: str = Form(...),
            shot_id: str = Form(...),
        ):
            row = api._shot_detail(series_id, shot_id)
            version = int(row["version"] or 1)
            path = api._reveal_path(
                api._shot_dir(
                    series_id,
                    int(row["ep_no"]),
                    int(row["sc_no"]),
                    int(row["shot_no"]),
                    version,
                )
            )
            return {"success": True, "path": path}

        @app.post("/series/plan")
        @app.post("/api/series/plan")
        async def series_plan(
            series_id: str = Form(...),
            use_global_refs: str = Form("0"),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
            if s["job_status"] == "running":
                raise HTTPException(status_code=400, detail="任务进行中，请稍候")

            async def _job():
                async with api._lock(series_id):
                    api._cancel[series_id] = False
                    api._set_job(series_id, "running")
                    try:
                        api._log(series_id, "DeepSeek 拆解：集 → 场 → 镜…")
                        key = api.deps["repo_deepseek_api_key"]()
                        url = api.deps["deepseek_api_url"]
                        raw = await asyncio.to_thread(
                            deepseek_series_plan,
                            s["synopsis"],
                            s["title"],
                            s["visual_style"],
                            s["aspect"],
                            s["shot_duration_sec"],
                            s["episode_count"],
                            s["scenes_per_ep"],
                            s["shots_per_scene"],
                            key,
                            url,
                        )
                        if not raw:
                            api._log(series_id, "DeepSeek 不可用，改用规则拆解")
                            plan = _fallback_series_plan(
                                s["synopsis"],
                                s["title"],
                                s["shot_duration_sec"],
                                s["episode_count"],
                                s["scenes_per_ep"],
                                s["shots_per_scene"],
                            )
                        else:
                            plan = _normalize_series_plan(
                                raw,
                                s["synopsis"],
                                s["shot_duration_sec"],
                                s["episode_count"],
                                s["scenes_per_ep"],
                                s["shots_per_scene"],
                            )
                        api._replace_tree_from_plan(series_id, plan)
                        n_ep = len(plan.get("episodes") or [])
                        n_sh = sum(
                            len(sc.get("shots") or [])
                            for ep in plan.get("episodes") or []
                            for sc in ep.get("scenes") or []
                        )
                        api._log(
                            series_id,
                            f"剧本结构就绪：{plan.get('title')} · {n_ep} 集 · 共 {n_sh} 镜",
                        )
                        use_refs = str(use_global_refs or "0").strip().lower() not in (
                            "0",
                            "false",
                            "off",
                            "no",
                        )
                        if use_refs:
                            await api._phase_global_refs(series_id)
                        else:
                            with api.db.connect() as conn:
                                conn.execute(
                                    "UPDATE series SET status=?, updated_at=? WHERE id=?",
                                    ("planned", _utc_now_str(), series_id),
                                )
                        api._set_job(series_id, "idle")
                    except Exception as e:
                        api._set_job(series_id, "error", str(e)[:500])
                        api._log(series_id, f"拆解失败：{e}")

            asyncio.create_task(_job())
            return {"success": True, "series_id": series_id}

        @app.post("/series/confirm-global-refs")
        @app.post("/api/series/confirm-global-refs")
        async def series_confirm_global_refs(
            series_id: str = Form(...),
            selected_json: str = Form("[]"),
            skip: str = Form("0"),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
                try:
                    refs = json.loads(s["global_refs_json"] or "[]")
                except Exception:
                    refs = []
            do_skip = str(skip or "0") in ("1", "true", "True")
            selected = set()
            if not do_skip:
                try:
                    selected = set(str(x) for x in json.loads(selected_json or "[]"))
                except Exception:
                    raise HTTPException(status_code=400, detail="selected_json 无效")
            for it in refs:
                if isinstance(it, dict):
                    it["selected"] = (not do_skip) and (it.get("filename") in selected)
            with api.db.connect() as conn:
                conn.execute(
                    "UPDATE series SET global_refs_json=?, status=?, updated_at=? WHERE id=?",
                    (
                        json.dumps(refs, ensure_ascii=False),
                        "planned",
                        _utc_now_str(),
                        series_id,
                    ),
                )
            api._log(
                series_id,
                "跳过全剧参考图" if do_skip else f"已确认全剧参考图 {len(selected)} 张",
            )
            return {"success": True, "series": api._tree(series_id)}

        @app.post("/series/upload-global-ref")
        @app.post("/api/series/upload-global-ref")
        async def series_upload_global_ref(
            series_id: str = Form(...),
            file: UploadFile = File(...),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
                try:
                    refs = json.loads(s["global_refs_json"] or "[]")
                except Exception:
                    refs = []
            raw = await file.read()
            if not raw:
                raise HTTPException(status_code=400, detail="空文件")
            refs_dir = api._series_dir(series_id) / "global_refs"
            refs_dir.mkdir(parents=True, exist_ok=True)
            n = len(list(refs_dir.glob("upload_*")))
            name = f"upload_{n:02d}.png"
            try:
                from io import BytesIO

                im = Image.open(BytesIO(raw))
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA")
                out = BytesIO()
                im.convert("RGB").save(out, format="PNG")
                raw = out.getvalue()
            except Exception:
                pass
            (refs_dir / name).write_bytes(raw)
            rel = api._rel(refs_dir / name)
            full_u, thumb_u = api._image_urls(rel)
            item = {
                "filename": name,
"url": full_u,
                "thumb_url": thumb_u,
                "rel": rel,
                "source": "upload",
                "label": (file.filename or name)[:80],
                "selected": True,
            }
            refs.append(item)
            with api.db.connect() as conn:
                conn.execute(
                    "UPDATE series SET global_refs_json=?, updated_at=? WHERE id=?",
                    (json.dumps(refs, ensure_ascii=False), _utc_now_str(), series_id),
                )
            api._log(series_id, f"已上传全剧参考图：{name}")
            return {"success": True, "item": item, "global_refs": refs}

        @app.post("/series/regen-global-ref")
        @app.post("/api/series/regen-global-ref")
        async def series_regen_global_ref(
            series_id: str = Form(...),
            filename: str = Form(...),
            feedback: str = Form(...),
        ):
            item = await api._regen_one_global_ref(series_id, filename, feedback)
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
                try:
                    refs = json.loads(s["global_refs_json"] or "[]")
                except Exception:
                    refs = []
            return {"success": True, "item": item, "global_refs": refs}

        @app.post("/series/run-shot")
        @app.post("/api/series/run-shot")
        async def series_run_shot(
            series_id: str = Form(...),
            shot_id: str = Form(...),
            force: str = Form("0"),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
            if s["job_status"] == "running":
                raise HTTPException(status_code=400, detail="已有任务在跑，请先取消或等待")
            do_force = str(force or "0") in ("1", "true", "True")
            asyncio.create_task(
                api._continue_job(series_id, only_shot_id=shot_id, force=do_force)
            )
            return {"success": True, "series_id": series_id}

        @app.post("/series/continue")
        @app.post("/api/series/continue")
        async def series_continue(
            series_id: str = Form(...),
            until_shot_id: str = Form(""),
            force: str = Form("0"),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
            if s["job_status"] == "running":
                raise HTTPException(status_code=400, detail="已有任务在跑")
            until = (until_shot_id or "").strip() or None
            do_force = str(force or "0") in ("1", "true", "True")
            api._log(
                series_id,
                "全部重跑（强制）…"
                if do_force
                else ("继续全自动（跑到指定镜）…" if until else "继续全自动（至全部完成）…"),
            )
            asyncio.create_task(
                api._continue_job(series_id, until_shot_id=until, force=do_force)
            )
            return {"success": True, "series_id": series_id}

        @app.post("/series/regen")
        @app.post("/api/series/regen")
        async def series_regen(
            series_id: str = Form(...),
            shot_id: str = Form(...),
        ):
            with api.db.connect() as conn:
                s = api._get_series_row(conn, series_id)
            if s["job_status"] == "running":
                raise HTTPException(status_code=400, detail="已有任务在跑")
            asyncio.create_task(
                api._continue_job(series_id, only_shot_id=shot_id, force=True)
            )
            return {"success": True, "series_id": series_id}

        @app.post("/series/cancel")
        @app.post("/api/series/cancel")
        async def series_cancel(series_id: str = Form(...)):
            api._cancel[series_id] = True
            api._log(series_id, "收到取消请求…")
            return {"success": True}

        @app.post("/series/free-vram")
        @app.post("/api/series/free-vram")
        async def series_free_vram(series_id: str = Form("")):
            sid = (series_id or "").strip()
            if sid:
                await api._free_comfy_vram(sid, "手动")
            else:
                fn = api.deps.get("free_comfyui_memory")
                if callable(fn):
                    await fn()
            return {"success": True, "message": "已请求释放显存"}

        @app.post("/series/delete")
        @app.post("/api/series/delete")
        async def series_delete(series_id: str = Form(...)):
            with api.db.connect() as conn:
                api._get_series_row(conn, series_id)
                conn.execute("DELETE FROM series_log WHERE series_id=?", (series_id,))
                conn.execute("DELETE FROM shot WHERE series_id=?", (series_id,))
                conn.execute("DELETE FROM scene WHERE series_id=?", (series_id,))
                conn.execute("DELETE FROM episode WHERE series_id=?", (series_id,))
                conn.execute("DELETE FROM series WHERE id=?", (series_id,))
            d = api.series_root / series_id
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
            return {"success": True}
