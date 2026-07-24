import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pymysql
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel

from recipe_ai import (
    MAX_INGREDIENTS_TEXT_LEN,
    MAX_RECIPE_IMAGES,
    detect_ingredients,
    generate_recipe,
    generate_recipe_from_selection,
    get_recipe_config,
)
from user_records import ensure_record_tables, router as records_router, _wire as wire_records
from image_tools import router as image_router, _wire as wire_image, ensure_image_quota_table
from life_plans import (
    router as life_plans_router,
    _wire as wire_life_plans,
    deepseek_configured as life_deepseek_ok,
    PLAN_KINDS as LIFE_PLAN_KINDS,
    LIFE_PLANS_PROMPT_REV,
)
from tianapi_life import router as life_router
from watermark import router as watermark_router

_wan_import_error = ""
try:
    from wan_video import router as wan_router, _wire as wire_wan, get_wan_config, wan_configured
except Exception as exc:  # pragma: no cover - surface on /health when deploy breaks
    wan_router = None

    def wire_wan(*_a, **_k):
        return None

    def get_wan_config():
        return {"configured": False, "error": str(exc)}

    def wan_configured():
        return False

    _wan_import_error = str(exc)
    print(f"[wan] import failed: {exc}")

app = FastAPI(title="Tool Basecamp API")

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "toolbasecamp")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "toolbasecamp")
DB_NAME = os.environ.get("DB_NAME", "toolbasecamp")

JWT_SECRET = os.environ.get("JWT_SECRET", "CHANGE_ME_IN_PRODUCTION")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
ROLE_ADMIN = "admin"
ROLE_USER = "user"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

GUESTBOOK_PAGE_SIZE = 30
GUESTBOOK_MAX_TEXT_LEN = 500
GUESTBOOK_MAX_GUEST_NAME_LEN = 20

RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
RECIPE_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
RECIPE_DETECT_LIMIT_GUEST = 20
RECIPE_DETECT_LIMIT_USER = 60
RECIPE_GENERATE_LIMIT_GUEST = 10
RECIPE_GENERATE_LIMIT_USER = 30

security = HTTPBearer(auto_error=False)

_db_available = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://toolbasecamp.com",
        "https://www.toolbasecamp.com",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterBody(BaseModel):
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


class GuestbookSendBody(BaseModel):
    content: str
    guest_name: Optional[str] = None


def get_conn():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def ensure_tables():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'user',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS guestbook_messages (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    user_id BIGINT NULL,
                    guest_name VARCHAR(50) NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_created (created_at),
                    INDEX idx_id (id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS recipe_rate_limits (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    limit_key VARCHAR(128) NOT NULL,
                    action_type VARCHAR(32) NOT NULL,
                    usage_date DATE NOT NULL,
                    usage_count INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_limit (limit_key, action_type, usage_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            ensure_record_tables(cur)
            ensure_image_quota_table(cur)
    finally:
        conn.close()


@app.on_event("startup")
def _startup():
    global _db_available
    try:
        ensure_tables()
        _db_available = True
    except Exception as e:
        print(f"[startup] MySQL unavailable, auth/guestbook disabled: {e}")


def require_db():
    global _db_available
    if _db_available:
        return
    try:
        ensure_tables()
        _db_available = True
    except Exception as e:
        print(f"[db] ensure_tables failed: {e}")
        raise HTTPException(
            status_code=503,
            detail="Guestbook service is temporarily unavailable. Please try again later.",
        ) from e


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def _fetch_user_by_id(user_id: int) -> Optional[dict]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, role, password_hash, created_at, updated_at FROM users WHERE id=%s",
                (user_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_current_user(creds: Optional[HTTPAuthorizationCredentials]):
    if creds is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = decode_token(creds.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    user_id = int(payload.get("sub") or 0)
    if user_id <= 0:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    user = _fetch_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


wire_records(get_conn, require_db, get_current_user)
app.include_router(records_router)
wire_image(get_conn, require_db, get_current_user)
app.include_router(image_router)
wire_life_plans(get_conn, require_db, get_current_user)
app.include_router(life_plans_router)
app.include_router(life_router)
app.include_router(watermark_router)
if wan_router is not None:
    wire_wan(get_conn, require_db, get_current_user)
    app.include_router(wan_router)
else:
    print("[wan] router not mounted:", _wan_import_error or "unknown")


def get_optional_user(creds: Optional[HTTPAuthorizationCredentials]) -> Optional[dict]:
    if creds is None:
        return None
    try:
        payload = decode_token(creds.credentials)
    except JWTError:
        return None
    user_id = int(payload.get("sub") or 0)
    if user_id <= 0:
        return None
    return _fetch_user_by_id(user_id)


def is_admin(user: dict) -> bool:
    return user.get("role") == ROLE_ADMIN or (user.get("email") or "").lower() == ADMIN_EMAIL


def require_admin(user: dict):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email or "User"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[:2]}***@{domain}"


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_rate_limit(limit_key: str, action_type: str, max_count: int):
    if max_count <= 0:
        return
    require_db()
    today = _today_utc()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT usage_count FROM recipe_rate_limits
                WHERE limit_key=%s AND action_type=%s AND usage_date=%s
                """,
                (limit_key, action_type, today),
            )
            row = cur.fetchone()
            current = int(row["usage_count"]) if row else 0
            if current >= max_count:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached. Please try again tomorrow or log in for a higher limit.",
                )
            if row:
                cur.execute(
                    """
                    UPDATE recipe_rate_limits SET usage_count = usage_count + 1
                    WHERE limit_key=%s AND action_type=%s AND usage_date=%s
                    """,
                    (limit_key, action_type, today),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO recipe_rate_limits (limit_key, action_type, usage_date, usage_count)
                    VALUES (%s, %s, %s, 1)
                    """,
                    (limit_key, action_type, today),
                )
    finally:
        conn.close()


def _normalize_locale(locale: str) -> str:
    loc = (locale or "").strip()
    return "zh-CN" if loc in ("zh-CN", "zh", "zh-cn") else "en"


class RecipeGenerateBody(BaseModel):
    ingredients: List[str]
    locale: Optional[str] = "en"


async def _read_recipe_images(images: List[UploadFile]) -> List[tuple]:
    if len(images) > MAX_RECIPE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"You can upload at most {MAX_RECIPE_IMAGES} images",
        )

    parsed: List[tuple] = []
    for image in images:
        if not image or not image.filename:
            continue
        image_mime = (image.content_type or "").split(";")[0].strip().lower()
        if image_mime not in RECIPE_IMAGE_MIMES:
            raise HTTPException(status_code=400, detail="Image must be JPEG, PNG, or WebP")
        image_bytes = await image.read()
        if len(image_bytes) == 0:
            continue
        if len(image_bytes) > RECIPE_IMAGE_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Each image must not exceed 5 MB")
        parsed.append((image_bytes, image_mime))
    return parsed


async def _collect_form_images(form) -> List[UploadFile]:
    uploads: List[UploadFile] = []
    seen = set()
    for key in ("images", "image"):
        for item in form.getlist(key):
            if not hasattr(item, "read"):
                continue
            ident = id(item)
            if ident in seen:
                continue
            seen.add(ident)
            uploads.append(item)
    return uploads


async def _recipe_detect_core(
    request: Request,
    *,
    ingredients_text: str,
    locale: str,
    image_payload: List[tuple],
    user: Optional[dict],
) -> dict:
    text = (ingredients_text or "").strip()
    if len(text) > MAX_INGREDIENTS_TEXT_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Ingredients text must not exceed {MAX_INGREDIENTS_TEXT_LEN} characters",
        )
    if not text and not image_payload:
        raise HTTPException(status_code=400, detail="Please enter ingredients or upload an image")

    limit_key = f"user:{user['id']}" if user else f"ip:{_client_ip(request)}"
    max_detect = RECIPE_DETECT_LIMIT_USER if user else RECIPE_DETECT_LIMIT_GUEST
    _check_rate_limit(limit_key, "detect", max_detect)

    try:
        result = await detect_ingredients(
            ingredients_text=text,
            images=image_payload,
            locale=_normalize_locale(locale),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        print(f"[recipe/detect] {exc}")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[recipe/detect] unexpected error: {exc}")
        raise HTTPException(status_code=500, detail="Ingredient detection failed. Please try again.") from exc

    return {"success": True, **result}


async def _recipe_generate_json_core(
    request: Request,
    body: RecipeGenerateBody,
    user: Optional[dict],
) -> dict:
    ingredients = [str(x).strip() for x in (body.ingredients or []) if str(x).strip()]
    if not ingredients:
        raise HTTPException(status_code=400, detail="Please select at least one ingredient")
    if len(ingredients) > 50:
        raise HTTPException(status_code=400, detail="Too many ingredients selected")

    limit_key = f"user:{user['id']}" if user else f"ip:{_client_ip(request)}"
    max_gen = RECIPE_GENERATE_LIMIT_USER if user else RECIPE_GENERATE_LIMIT_GUEST
    _check_rate_limit(limit_key, "generate", max_gen)

    try:
        recipe = await generate_recipe_from_selection(
            ingredients=ingredients,
            locale=_normalize_locale(body.locale or "en"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        print(f"[recipe/generate] {exc}")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[recipe/generate] unexpected error: {exc}")
        raise HTTPException(status_code=500, detail="Recipe generation failed. Please try again.") from exc

    recipe["selected_ingredients"] = ingredients
    return {"success": True, "recipe": recipe}


def _sanitize_guest_name(name: str) -> str:
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", (name or "").strip())
    cleaned = cleaned[:GUESTBOOK_MAX_GUEST_NAME_LEN]
    return cleaned or "Guest"


def _serialize_guestbook_row(row: dict) -> dict:
    email = row.get("email") or ""
    user_id = row.get("user_id")
    if user_id:
        sender_name = _mask_email(email)
        is_guest = False
    else:
        sender_name = _sanitize_guest_name(row.get("guest_name") or "Guest")
        is_guest = True
    created = row.get("created_at")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    return {
        "id": int(row.get("id") or 0),
        "sender_name": sender_name,
        "is_guest": is_guest,
        "content": row.get("content") or "",
        "created_at": created,
    }


@app.get("/health")
def health():
    db_ok = False
    if _db_available:
        db_ok = True
    else:
        try:
            conn = get_conn()
            conn.close()
            db_ok = True
        except Exception:
            db_ok = False
    paths = {getattr(r, "path", "") for r in app.routes}
    deploy_sha = ""
    try:
        sha_path = os.path.join(os.path.dirname(__file__), "DEPLOY_SHA")
        if os.path.isfile(sha_path):
            with open(sha_path, encoding="utf-8") as fh:
                deploy_sha = (fh.read() or "").strip()[:40]
    except OSError:
        deploy_sha = ""
    # Probe whether in-memory records serializer uses annual anniversary logic
    days_sample = None
    try:
        from user_records import _anniversary_cycle

        days_sample = _anniversary_cycle(date(2015, 5, 20), date.today()).get("daysLeft")
    except Exception:
        days_sample = None
    try:
        from tencent_image import tencent_configured as _tencent_ok

        tencent_image_ok = bool(_tencent_ok())
    except Exception:
        tencent_image_ok = False
    return {
        "ok": True,
        "service": "toolbasecamp-api",
        "db": db_ok,
        "recipe_api": "/recipe/generate" in paths and "/recipe/detect" in paths,
        "records_api": "/records/days" in paths,
        "records_todos": "/records/todos" in paths,
        "records_clock_reset": "/records/clocks/{clock_id}/reset" in paths,
        "records_clock_logs": "/records/clocks/{clock_id}/logs" in paths,
        "image_api": "/image/ocr-text" in paths,
        "general_cutout_api": "/image/general-cutout/segment" in paths,
        "life_plans_api": "/life-plans/generate" in paths,
        "life_plans_kinds": sorted(LIFE_PLAN_KINDS),
        "life_plans_day_trip": "day_trip" in LIFE_PLAN_KINDS,
        "life_plans_ready": all(
            k in LIFE_PLAN_KINDS
            for k in (
                "day_trip",
                "savings",
                "interview",
                "family_meal",
                "travel_pack",
                "office_lunch",
            )
        ),
        "life_plans_prompt_rev": LIFE_PLANS_PROMPT_REV,
        "tencent_image": tencent_image_ok,
        "life_plans_deepseek": life_deepseek_ok(),
        "watermark_api": "/watermark/image/process" in paths,
        "wan_i2v_api": "/wan/i2v/submit" in paths,
        "wan_i2v": get_wan_config(),
        "wan_configured": wan_configured(),
        "wan_import_error": _wan_import_error or None,
        "api_features": ["wan_i2v"],
        "records_annual": isinstance(days_sample, int) and abs(int(days_sample)) < 400,
        "deploy_sha": deploy_sha,
        "recipe": get_recipe_config(),
        "ts": int(time.time()),
    }


@app.post("/auth/register")
def register(body: RegisterBody):
    require_db()
    email = (body.email or "").strip().lower()
    password = body.password or ""

    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must not exceed 72 characters")

    if email == ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="This account cannot be registered")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email=%s", (email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")

            try:
                pw_hash = hash_password(password)
            except Exception as exc:
                print(f"[register] hash_password failed: {exc}")
                raise HTTPException(status_code=500, detail="Registration failed. Please try again.") from exc

            cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, %s)",
                (email, pw_hash, ROLE_USER),
            )
            user_id = cur.lastrowid
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[register] database error: {exc}")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.") from exc
    finally:
        conn.close()

    if not user_id:
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

    token = create_access_token(int(user_id), email)
    return {"success": True, "token": token}


@app.post("/auth/login")
def login(body: LoginBody):
    require_db()
    email = (body.email or "").strip().lower()
    password = body.password or ""

    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, role FROM users WHERE email=%s",
                (email,),
            )
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    if email == ADMIN_EMAIL and user.get("role") != ROLE_ADMIN:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET role=%s WHERE email=%s", (ROLE_ADMIN, email))
        finally:
            conn.close()
        user["role"] = ROLE_ADMIN

    token = create_access_token(int(user["id"]), user["email"])
    return {"success": True, "token": token}


@app.post("/auth/change-password")
def change_password(
    body: ChangePasswordBody,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    require_db()
    user = get_current_user(creds)
    old_password = body.old_password or ""
    new_password = body.new_password or ""

    if not verify_password(old_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash=%s WHERE id=%s",
                (hash_password(new_password), user["id"]),
            )
    finally:
        conn.close()

    return {"success": True}


@app.get("/auth/me")
def me(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    require_db()
    user = get_current_user(creds)
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "created_at": user["created_at"],
            "updated_at": user["updated_at"],
        },
    }


@app.get("/guestbook/messages")
def guestbook_list_messages(before_id: int = 0, limit: int = GUESTBOOK_PAGE_SIZE):
    require_db()
    lim = max(1, min(int(limit or GUESTBOOK_PAGE_SIZE), 100))
    rows: List[dict] = []
    has_more = False
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            bid = max(0, int(before_id or 0))
            if bid > 0:
                cur.execute(
                    """
                    SELECT g.id, g.user_id, g.guest_name, g.content, g.created_at, u.email
                    FROM guestbook_messages g
                    LEFT JOIN users u ON u.id = g.user_id
                    WHERE g.id < %s
                    ORDER BY g.id DESC
                    LIMIT %s
                    """,
                    (bid, lim),
                )
            else:
                cur.execute(
                    """
                    SELECT g.id, g.user_id, g.guest_name, g.content, g.created_at, u.email
                    FROM guestbook_messages g
                    LEFT JOIN users u ON u.id = g.user_id
                    ORDER BY g.id DESC
                    LIMIT %s
                    """,
                    (lim,),
                )
            rows = cur.fetchall() or []
            has_more = len(rows) >= lim
    finally:
        conn.close()

    return {
        "success": True,
        "messages": [_serialize_guestbook_row(r) for r in rows],
        "has_more": has_more,
    }


@app.post("/guestbook/messages")
def guestbook_send_message(
    body: GuestbookSendBody,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    require_db()
    user = get_optional_user(creds)
    text = (body.content or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > GUESTBOOK_MAX_TEXT_LEN:
        raise HTTPException(status_code=400, detail=f"Message must not exceed {GUESTBOOK_MAX_TEXT_LEN} characters")

    user_id = None
    guest_name = None
    if user:
        user_id = user["id"]
    else:
        guest_name = _sanitize_guest_name(body.guest_name or "Guest")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO guestbook_messages (user_id, guest_name, content) VALUES (%s, %s, %s)",
                (user_id, guest_name, text),
            )
            msg_id = cur.lastrowid
            cur.execute(
                """
                SELECT g.id, g.user_id, g.guest_name, g.content, g.created_at, u.email
                FROM guestbook_messages g
                LEFT JOIN users u ON u.id = g.user_id
                WHERE g.id = %s
                """,
                (msg_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    return {"success": True, "message": _serialize_guestbook_row(row)}


@app.delete("/guestbook/messages/{message_id}")
def guestbook_delete_message(
    message_id: int,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    require_db()
    admin = get_current_user(creds)
    require_admin(admin)

    msg_id = int(message_id or 0)
    if msg_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid message ID")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM guestbook_messages WHERE id=%s", (msg_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Message not found")
    finally:
        conn.close()

    return {"success": True, "message": "Message deleted"}


def _libreoffice_convert(input_path: str, output_dir: str, output_fmt: str) -> str:
    lo_candidates = ["libreoffice", "soffice", "/usr/bin/libreoffice", "/usr/bin/soffice"]
    lo_bin = None
    for candidate in lo_candidates:
        if shutil.which(candidate) or os.path.isfile(candidate):
            lo_bin = candidate
            break
    if not lo_bin:
        raise RuntimeError("LibreOffice not found. Install with: apt install -y libreoffice-writer")

    cmd = [lo_bin, "--headless", "--convert-to", output_fmt, "--outdir", output_dir, input_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "LibreOffice conversion failed")

    base = os.path.splitext(os.path.basename(input_path))[0]
    out_file = os.path.join(output_dir, f"{base}.{output_fmt}")
    if not os.path.isfile(out_file):
        matches = [f for f in os.listdir(output_dir) if f.startswith(base)]
        if matches:
            out_file = os.path.join(output_dir, matches[0])
        else:
            raise RuntimeError("Output file not found after conversion")
    return out_file


@app.post("/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file (.pdf)")

    try:
        from pdf2docx import Converter
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="Missing pdf2docx dependency") from exc

    tmp_dir = tempfile.mkdtemp()
    try:
        in_path = os.path.join(tmp_dir, os.path.basename(file.filename))
        out_name = os.path.splitext(os.path.basename(file.filename))[0] + ".docx"
        out_path = os.path.join(tmp_dir, out_name)

        content = await file.read()
        with open(in_path, "wb") as handle:
            handle.write(content)

        converter = Converter(in_path)
        converter.convert(out_path, start=0, end=None)
        converter.close()

        return FileResponse(
            path=out_path,
            filename=out_name,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except HTTPException:
        raise
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc


@app.post("/recipe/detect")
async def recipe_detect(
    request: Request,
    ingredients_text: str = Form(""),
    locale: str = Form("en"),
    images: List[UploadFile] = File(default=[]),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    user = get_optional_user(creds)
    image_payload = await _read_recipe_images(images or [])
    return await _recipe_detect_core(
        request,
        ingredients_text=ingredients_text,
        locale=locale,
        image_payload=image_payload,
        user=user,
    )


@app.post("/recipe/generate")
async def recipe_generate(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    user = get_optional_user(creds)
    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON body") from exc
        body = RecipeGenerateBody(**payload)
        return await _recipe_generate_json_core(request, body, user)

    if "multipart/form-data" in content_type:
        form = await request.form()
        step = str(form.get("step") or "").strip().lower()
        text = str(form.get("ingredients_text") or "").strip()
        locale = str(form.get("locale") or "en")
        image_payload = await _read_recipe_images(await _collect_form_images(form))

        if step == "detect":
            return await _recipe_detect_core(
                request,
                ingredients_text=text,
                locale=locale,
                image_payload=image_payload,
                user=user,
            )

        if not text and not image_payload:
            raise HTTPException(status_code=400, detail="Please enter ingredients or upload an image")

        limit_key = f"user:{user['id']}" if user else f"ip:{_client_ip(request)}"
        max_gen = RECIPE_GENERATE_LIMIT_USER if user else RECIPE_GENERATE_LIMIT_GUEST
        _check_rate_limit(limit_key, "generate", max_gen)

        image_bytes = image_payload[0][0] if image_payload else None
        image_mime = image_payload[0][1] if image_payload else None
        try:
            recipe = await generate_recipe(
                ingredients_text=text,
                image_bytes=image_bytes,
                image_mime=image_mime,
                locale=_normalize_locale(locale),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            print(f"[recipe/generate] {exc}")
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            print(f"[recipe/generate] unexpected error: {exc}")
            raise HTTPException(status_code=500, detail="Recipe generation failed. Please try again.") from exc

        return {"success": True, "recipe": recipe}

    raise HTTPException(
        status_code=400,
        detail="Use application/json for selected ingredients, or multipart/form-data for detect/legacy upload",
    )


@app.post("/word-to-pdf")
async def word_to_pdf(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".doc") or filename.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Please upload a .doc or .docx file")

    tmp_dir = tempfile.mkdtemp()
    try:
        in_path = os.path.join(tmp_dir, os.path.basename(file.filename))
        out_name = os.path.splitext(os.path.basename(file.filename))[0] + ".pdf"
        out_path = os.path.join(tmp_dir, out_name)

        content = await file.read()
        with open(in_path, "wb") as handle:
            handle.write(content)

        converted = False
        try:
            from docx2pdf import convert

            convert(in_path, out_path)
            converted = os.path.isfile(out_path)
        except Exception:
            pass

        if not converted:
            out_path = _libreoffice_convert(in_path, tmp_dir, "pdf")

        return FileResponse(path=out_path, filename=out_name, media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc
