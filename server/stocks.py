"""Admin-only A-share stock pick strategies (migrated from web-tool)."""
from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/stocks", tags=["stocks"])
security = HTTPBearer(auto_error=False)

_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

def wire(get_current_user: Callable[..., Any], require_admin: Callable[[dict], None]) -> None:
    global _get_current_user, _require_admin
    _get_current_user = get_current_user
    _require_admin = require_admin

def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Stocks admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user

STOCK_FIT_MIN = 10

STOCK_PICK_MAX = 3  # 严格阈值下按匹配度取前 N；不足则更少，不放宽条件

STRATEGY_FIT_MIN = {
    "short_term": (52.0, 46.0),
    "tail_buy": (42.0, 38.0),
    "tail_buy_relaxed": (36.0, 32.0),
    "strong_momentum": (48.0, 44.0),
    "volume_breakout": (50.0, 44.0),
    "monster_stock": (52.0, 46.0),
    "steady_low_watch": (12.0, 12.0),
    "monthly_recovery": (35.0, 30.0),
}

_HTTP_SESSION = requests.Session()

_INDEX_HS300_ZZ500_CACHE = {
    "ts": 0.0,
    "codes": None,  # type: ignore
}

_MONTHLY_RECOVERY_CACHE = {
    "updating": False,
}

_RESTRICTED_SYMBOLS_CACHE = {
    "ts": 0.0,
    "symbols": set(),
}

_STOCK_EMPTY_RETRY_ATTEMPTS = 3

_STOCK_EMPTY_RETRY_INTERVAL_S = 2.5

_STOCK_NEG_NEWS_KEYWORDS = (
    "退市", "终止上市", "暂停上市", "实施退市", "可能被实施",
    "*ST", "实施ST", "其他风险警示", "退市风险警示",
    "立案调查", "立案告知书", "证监会处罚", "行政处罚决定",
    "财务造假", "虚增利润", "虚增营收", "欺诈发行",
    "破产清算", "破产重整", "预重整", "债务违约", "债券违约",
    "无法表示意见", "否定意见", "持续经营能力存在重大不确定性",
    "重大违法强制退市", "被列入失信", "账户被冻结",
)

_TAIL_BUY_CACHE = {
    "ts": 0.0,
    "data": None,
    "updating": False,
}

def _safe_float(v):
    try:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip().replace(",", "")
            if s in ("", "-", "--"):
                return None
            return float(s)
        return float(v)
    except Exception:
        return None

def _calc_ma_list(values: List[float], window: int):
    try:
        if not values or len(values) < window:
            return None
        tail = values[-window:]
        return float(sum(tail) / float(window))
    except Exception:
        return None

def _calc_ret_pct_list(values: List[float], days: int):
    try:
        if not values or len(values) <= days:
            return None
        last = float(values[-1])
        prev = float(values[-1 - days])
        if prev == 0:
            return None
        return (last / prev - 1.0) * 100.0
    except Exception:
        return None

def _next_trade_date(base_date: datetime.date):
    d = base_date
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d

def _shift_trade_days(base_date: datetime.date, days: int):
    d = _next_trade_date(base_date)
    step = 1 if days >= 0 else -1
    left = abs(int(days))
    while left > 0:
        d += timedelta(days=step)
        if d.weekday() < 5:
            left -= 1
    return d

def _tail_buy_trade_dates():
    """尾盘：买入日=当前交易日，卖出日=下一交易日（不受 15:00 后逻辑影响）。"""
    today = datetime.now().date()
    if today.weekday() >= 5:
        buy = _shift_trade_days(today, 1)
    else:
        buy = today
    sell = _shift_trade_days(buy, 1)
    return buy.strftime("%Y-%m-%d"), sell.strftime("%Y-%m-%d")

def _buy_sell_dates(hold_trade_days: int = 10):
    today = datetime.now().date()
    now = datetime.now()
    if today.weekday() >= 5 or now.hour >= 15:
        buy_date = _shift_trade_days(today, 1)
    else:
        buy_date = _next_trade_date(today)
    sell_date = _shift_trade_days(buy_date, hold_trade_days)
    return buy_date.strftime("%Y-%m-%d"), sell_date.strftime("%Y-%m-%d")

def _is_tradable_stock(code: str) -> bool:
    """
    统一过滤函数：判断是否为普通账户可买的标的。
    排除：创业板、科创板、北交所、ST、两融标的
    """
    s = str(code or "").strip()
    if len(s) < 6:
        return False
    
    # 排除创业板（300/301）、科创板（688/689）、北交所（8/4开头）
    if s.startswith(("300", "301", "688", "689", "8", "4")):
        return False
    
    # 排除ST股票（名称中包含ST，但这里只能通过代码判断，实际需要在行情数据中检查）
    # 暂时通过代码段判断：ST通常没有特殊前缀，但可以在后续行情过滤中检查
    
    # 只保留主板：沪深A股（000/001/002/003/600/601/603/605）
    return s.startswith(("000", "001", "002", "003", "600", "601", "603", "605"))

def _is_risky_stock_name(name: str) -> bool:
    """ST、*ST、退市整理等高风险名称标记。"""
    raw = str(name or "").strip()
    if not raw:
        return True
    n = raw.upper()
    if "ST" in n or "*ST" in n:
        return True
    if "退" in raw:
        return True
    return False

def _fetch_stock_recent_ann_titles(symbol: str, limit: int = 12) -> List[str]:
    """拉取个股近期公告标题（东财）；失败返回空列表。"""
    code = str(symbol or "").strip()
    if len(code) < 6:
        return []
    url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
    params = {
        "page_size": max(5, min(int(limit), 30)),
        "page_index": 1,
        "ann_type": "A",
        "stock_list": code,
        "client_source": "web",
        "f_node": "0",
        "s_node": "0",
    }
    try:
        js = _em_request_json(url, params=params, timeout=6.0, retries=1)
        lst = (((js or {}).get("data") or {}).get("list")) or []
        titles: List[str] = []
        for it in lst:
            t = str((it or {}).get("title_ch") or (it or {}).get("title") or "").strip()
            if t:
                titles.append(t)
        return titles
    except Exception:
        return []

def _stock_negative_news_hit(symbol: str) -> Optional[str]:
    """
    若近期公告命中严重负面关键词，返回命中原因；否则返回 None。
    接口失败时 fail-open（返回 None）。单人自用不做缓存，每次现查。
    """
    code = str(symbol or "").strip()
    if not code:
        return "代码无效"
    titles = _fetch_stock_recent_ann_titles(code, limit=12)
    if not titles:
        return None
    for title in titles:
        for kw in _STOCK_NEG_NEWS_KEYWORDS:
            if kw and kw in title:
                return f"公告含「{kw}」：{title[:48]}"
    return None

def _is_basic_pick(symbol: str, name: str) -> bool:
    """最终结果兜底过滤：确保 only_basic 开启时不会漏出限制标的。"""
    s = str(symbol or "").strip()
    if not _is_tradable_stock(s):
        return False
    if _is_risky_stock_name(name):
        return False
    if s in _get_restricted_symbols():
        return False
    return True

def _stock_market_info(symbol: str) -> dict:
    """
    返回市场板块与账号权限提示。
    account_limit 非空表示普通账户常见需额外开通，或黑名单/两融限制。
    可用环境变量 ACCOUNT_ALLOWED_EXCHANGES=SZ（或 SZ,SH）标注未开通市场。
    """
    s = str(symbol or "").strip()
    info = {
        "market": "未知板块",
        "exchange": "",
        "account_limit": None,
    }
    if s.startswith(("600", "601", "603", "605")):
        info.update({"market": "沪市主板", "exchange": "SH"})
    elif s.startswith(("000", "001", "002", "003")):
        info.update({"market": "深市主板", "exchange": "SZ"})
    elif s.startswith(("300", "301")):
        info.update({
            "market": "创业板",
            "exchange": "SZ",
            "account_limit": "需开通创业板交易权限",
        })
    elif s.startswith(("688", "689")):
        info.update({
            "market": "科创板",
            "exchange": "SH",
            "account_limit": "需开通科创板交易权限",
        })
    elif s.startswith(("8", "4")) and len(s) == 6:
        info.update({
            "market": "北交所",
            "exchange": "BJ",
            "account_limit": "需开通北交所交易权限",
        })

    # 按账号已开通市场标注（例：只开通深市 → ACCOUNT_ALLOWED_EXCHANGES=SZ）
    allowed_raw = (os.environ.get("ACCOUNT_ALLOWED_EXCHANGES") or "").strip().upper()
    if allowed_raw and info.get("exchange"):
        allowed = {x.strip() for x in allowed_raw.split(",") if x.strip()}
        if allowed and info["exchange"] not in allowed:
            market_name = info.get("market") or info["exchange"]
            note = f"账号未开通{market_name}，可能无法买入"
            info["account_limit"] = (
                f"{info['account_limit']}；{note}" if info["account_limit"] else note
            )

    try:
        if s and s in _get_restricted_symbols():
            extra = "账号限制/两融标的（可能无法普通买入）"
            info["account_limit"] = (
                f"{info['account_limit']}；{extra}" if info["account_limit"] else extra
            )
    except Exception:
        pass
    return info

def _attach_market_fields(item: dict) -> dict:
    """给推荐结果附加市场与账号限制字段。"""
    info = _stock_market_info(item.get("symbol"))
    item["market"] = info.get("market")
    item["exchange"] = info.get("exchange")
    item["account_limit"] = info.get("account_limit")
    item["account_restricted"] = bool(info.get("account_limit"))
    return item

def _strategy_fit_min(strategy: str, is_trade_time: Optional[bool] = None) -> float:
    if is_trade_time is None:
        is_trade_time = _is_a_share_trade_time()
    pair = STRATEGY_FIT_MIN.get(strategy, (STOCK_FIT_MIN, max(6.0, STOCK_FIT_MIN - 4.0)))
    return float(pair[0] if is_trade_time else pair[1])

def _effective_vr(vr: Optional[float], is_trade_time: bool) -> Optional[float]:
    """非交易时间量比常为 0，按中性值 1.0 参与评分。"""
    v = _safe_float(vr)
    if v is None or v <= 0:
        return 1.0 if not is_trade_time else v
    return v

def _fit_min_score(is_trade_time: Optional[bool] = None) -> float:
    if is_trade_time is None:
        is_trade_time = _is_a_share_trade_time()
    return STOCK_FIT_MIN if is_trade_time else max(6.0, STOCK_FIT_MIN - 4.0)

def _is_a_share_trade_time() -> bool:
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    h, m = now.hour, now.minute
    if h == 9 and m >= 30:
        return True
    return 10 <= h < 15

def _fit_in_range(val: Optional[float], lo: float, hi: float, pad: float = 1.0) -> float:
    """1.0 表示落在理想区间，区间外按 pad 衰减到 0。"""
    if val is None:
        return 0.0
    v = float(val)
    if lo <= v <= hi:
        return 1.0
    span = max(hi - lo, 0.01)
    if v < lo:
        return max(0.0, 1.0 - (lo - v) / (span * pad))
    return max(0.0, 1.0 - (v - hi) / (span * pad))

def _count_consecutive_up_days(closes: List[float]) -> int:
    """从最近交易日往前数连续收涨天数（不含当日，当日用 spot 涨跌幅判断）。"""
    if len(closes) < 3:
        return 0
    streak = 0
    for i in range(len(closes) - 1, 0, -1):
        if closes[i] > closes[i - 1]:
            streak += 1
        else:
            break
    return streak

def _strong_momentum_fit_score(
    last_close, ma5, ma10, ma20, ret_3d, ret_5d, pct, vr,
    near_high_ratio, prior_up_days, amount, close_vs_high,
) -> float:
    """强势弹性评分：当日确认偏强、放量、收盘贴近日高，偏隔夜溢价。"""
    s = 0.0
    # 当日涨幅：要强，但留次日空间（避开贴板）
    s += _fit_in_range(pct, 2.5, 6.8, pad=1.0) * 26.0
    # 量比确认
    s += _fit_in_range(vr, 1.3, 3.2, pad=0.8) * 16.0
    # 尾盘仍靠近日内高点
    if close_vs_high is not None:
        if close_vs_high >= 0.985:
            s += 16.0
        elif close_vs_high >= 0.97:
            s += 12.0
        elif close_vs_high >= 0.955:
            s += 6.0
    if ma5 and ma10 and last_close >= ma5 * 0.998 and ma5 >= ma10 * 0.995:
        s += 12.0
    elif ma5 and last_close >= ma5:
        s += 6.0
    if ma20 and last_close >= ma20:
        s += 6.0
    if ret_5d is not None:
        if 2.0 <= ret_5d <= 14.0:
            s += 12.0
        elif 0.5 <= ret_5d < 2.0 or 14.0 < ret_5d <= 20.0:
            s += 6.0
    if ret_3d is not None and ret_3d >= 0.5:
        s += 8.0
    if near_high_ratio is not None:
        if 0.78 <= near_high_ratio <= 0.98:
            s += 10.0
        elif near_high_ratio >= 0.70:
            s += 5.0
    if prior_up_days is not None and 1 <= prior_up_days <= 3:
        s += 8.0
    elif prior_up_days == 0:
        s += 4.0
    if amount is not None and amount >= 3e8:
        s += 8.0
    elif amount is not None and amount >= 1.5e8:
        s += 4.0
    return s


def _strong_momentum_eval_row(row, is_trade_time: bool):
    """
    强势弹性（隔夜）：当日温和偏强~较强、放量、收盘贴近日高，短均线多头。
    尾盘确认后买入，博弈次日早盘溢价；不追已接近涨停板的标的。
    """
    code = str(row.get("代码") or "").strip()
    name = str(row.get("名称") or "").strip()
    if not code or not name or _is_risky_stock_name(name) or not _is_tradable_stock(code):
        return None
    try:
        daily_k = _em_kline(code, klt=101, lmt=75, timeout=5.0, retries=1)
    except Exception:
        return None
    if not daily_k or not daily_k.get("ohlc"):
        return None
    ohlc = daily_k.get("ohlc") or []
    closes = [_safe_float(x[1]) for x in ohlc if isinstance(x, list) and len(x) >= 2]
    highs = [_safe_float(x[3]) for x in ohlc if isinstance(x, list) and len(x) >= 4]
    closes = [c for c in closes if c is not None]
    highs = [h for h in highs if h is not None]
    if len(closes) < 30 or not highs:
        return None

    ma5 = _calc_ma_list(closes, 5)
    ma10 = _calc_ma_list(closes, 10)
    ma20 = _calc_ma_list(closes, 20)
    if ma5 is None or ma10 is None or ma20 is None:
        return None

    last_close = closes[-1]
    day_high = highs[-1]
    pct = _safe_float(row.get("__pct"))
    turn = _safe_float(row.get("__turn"))
    vr = _effective_vr(_safe_float(row.get("__vr")), is_trade_time)
    price = _safe_float(row.get("__price"))
    amt = _safe_float(row.get("__amount"))
    ret_3d = _calc_ret_pct_list(closes, 3)
    ret_5d = _calc_ret_pct_list(closes, 5)
    ret_20d = _calc_ret_pct_list(closes, 20)

    # 要强：避开弱势与贴板
    if pct is None or pct < 2.0 or pct > 7.5:
        return None
    if vr is not None and (vr < 1.15 or vr > 4.5):
        return None
    if turn is not None and (turn < 0.35 or turn > 18.0):
        return None
    if last_close < ma5 * 0.997:
        return None
    if ma5 < ma10 * 0.99:
        return None
    if ret_5d is not None and (ret_5d < 0.5 or ret_5d > 22.0):
        return None
    if ret_3d is not None and ret_3d < -1.0:
        return None
    if ret_20d is not None and ret_20d > 45.0:
        return None

    close_vs_high = (last_close / day_high) if day_high and day_high > 0 else None
    if close_vs_high is None or close_vs_high < 0.955:
        return None

    prior_up_days = _count_consecutive_up_days(closes[:-1])
    if prior_up_days > 4:
        return None

    win_highs = highs[-60:] if len(highs) >= 60 else highs
    recent_high = max(win_highs) if win_highs else None
    near_high_ratio = (last_close / recent_high) if recent_high and recent_high > 0 else None
    # 过弱位置（远离阶段高点太多）更像反弹赌运气，强势弹性要有趋势身位
    if near_high_ratio is not None and near_high_ratio < 0.62:
        return None

    fit = _strong_momentum_fit_score(
        last_close, ma5, ma10, ma20, ret_3d, ret_5d, pct, vr,
        near_high_ratio, prior_up_days, amt, close_vs_high,
    )
    if fit < _strategy_fit_min("strong_momentum", is_trade_time):
        return None
    return {
        "symbol": code,
        "name": name,
        "score": fit,
        "price": price,
        "pct": pct,
        "turn": turn,
        "vr": vr,
        "amount": amt,
        "ma5": ma5,
        "ma10": ma10,
        "ma20": ma20,
        "ret_3d": ret_3d,
        "ret_5d": ret_5d,
        "ret_20d": ret_20d,
        "near_high_ratio": round(near_high_ratio * 100.0, 2) if near_high_ratio is not None else None,
        "close_vs_high": round(close_vs_high * 100.0, 2) if close_vs_high is not None else None,
        "prior_up_days": prior_up_days,
        "match_tier": "strong_momentum",
    }


def _apply_sorted_picks(
    candidates: List[dict],
    only_basic: bool,
    min_score: Optional[float] = None,
    is_trade_time: Optional[bool] = None,
    strategy: Optional[str] = None,
    max_results: int = STOCK_PICK_MAX,
) -> List[dict]:
    """按匹配度 score 降序，仅保留达标标的；max_results<=0 时不截断数量。"""
    if is_trade_time is None:
        is_trade_time = _is_a_share_trade_time()
    if min_score is None and strategy:
        ms = _strategy_fit_min(strategy, is_trade_time)
    elif min_score is None:
        ms = _fit_min_score(is_trade_time)
    else:
        ms = float(min_score)

    def _pass_basic(r: dict) -> bool:
        return (not only_basic) or _is_basic_pick(r.get("symbol"), r.get("name"))

    ranked = sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)
    out = []
    for r in ranked:
        if max_results > 0 and len(out) >= max_results:
            break
        if float(r.get("score") or 0) < ms:
            continue
        if not _pass_basic(r):
            continue
        out.append(r)
    return out

def _round_match_score(score: Optional[float]) -> Optional[float]:
    v = _safe_float(score)
    if v is None:
        return None
    return round(v, 1)

def _is_retryable_empty(result: Optional[dict]) -> bool:
    """仅对行情/K线拉取失败重试；策略筛完为空或大盘偏弱不再整轮重算（避免触发网关 120s 超时）。"""
    if not result:
        return True
    if result.get("no_retry"):
        return False
    if result.get("items"):
        return False
    msg = str(result.get("message") or "")
    markers = ("失败", "超时", "为空", "timeout", "Timeout")
    return any(m in msg for m in markers)


def _with_empty_result_retry(compute_fn, only_basic: bool):
    """无结果时间隔重试，应对行情/K线接口偶发失败（不改变策略筛选标准）。"""
    last: Optional[dict] = None
    for attempt in range(_STOCK_EMPTY_RETRY_ATTEMPTS):
        last = compute_fn(only_basic=only_basic)
        if last and last.get("items"):
            if attempt > 0:
                last = dict(last)
                msg = (last.get("message") or "").strip()
                retry_note = f"（第{attempt + 1}次查询成功）"
                last["message"] = f"{msg}{retry_note}".strip() if msg else retry_note
            return last
        if not _is_retryable_empty(last):
            return last or {
                "success": False,
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "items": [],
                "message": "查询失败，请稍后重试",
            }
        if attempt < _STOCK_EMPTY_RETRY_ATTEMPTS - 1:
            time.sleep(_STOCK_EMPTY_RETRY_INTERVAL_S)
    return last or {
        "success": False,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "items": [],
        "message": "查询失败，请稍后重试",
    }

def _get_restricted_symbols() -> set:
    """
    获取“权限限制标的”集合（如融资融券），用于 only_basic 的额外过滤。
    - 优先使用缓存（10分钟）
    - 失败时返回上次缓存
    - 支持通过环境变量补充手工黑名单：RESTRICTED_SYMBOLS=600338,600000
    """
    now_ts = time.time()
    cache_ts = float(_RESTRICTED_SYMBOLS_CACHE.get("ts") or 0.0)
    cache_symbols = _RESTRICTED_SYMBOLS_CACHE.get("symbols") or set()
    if cache_symbols and (now_ts - cache_ts) <= 600:
        return cache_symbols

    symbols = set(cache_symbols)

    # 手工补充黑名单，便于快速兜底（例如用户临时指定“西藏珠峰”等）
    env_extra = os.environ.get("RESTRICTED_SYMBOLS", "")
    if env_extra:
        for it in env_extra.split(","):
            code = str(it or "").strip()
            if code:
                symbols.add(code)

    # 尝试抓取新浪“融资融券”板块（不同环境节点名可能不同，逐个尝试）
    try:
        nodes = ["rzrq", "hs_rzrq", "sh_rzrq", "sz_rzrq"]
        sina_headers = {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.sina.com.cn/",
            "Accept-Encoding": "identity",
        }
        url = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
        import json as _json
        for node in nodes:
            for page in range(1, 6):
                try:
                    params = {
                        "page": page,
                        "num": 200,
                        "sort": "symbol",
                        "asc": 1,
                        "node": node,
                        "symbol": "",
                        "_s_r_a": "page",
                    }
                    r = _http_get(url, params=params, headers=sina_headers, timeout=5)
                    r.encoding = "utf-8"
                    txt = (r.text or "").strip()
                    if not txt or txt.startswith("<") or txt == "[]":
                        break
                    arr = _json.loads(txt)
                    if not arr:
                        break
                    for row in arr:
                        c = str(row.get("code") or "").strip()
                        if c and len(c) >= 6:
                            symbols.add(c[-6:])
                    if len(arr) < 200:
                        break
                except Exception:
                    break
    except Exception:
        pass

    _RESTRICTED_SYMBOLS_CACHE["ts"] = now_ts
    _RESTRICTED_SYMBOLS_CACHE["symbols"] = symbols
    return symbols

def _reason_text(metrics: dict) -> str:
    m = metrics or {}
    parts = []
    pct = _safe_float(m.get("pct_change"))
    ret_5d = _safe_float(m.get("ret_5d"))
    ma5 = _safe_float(m.get("ma5"))
    ma10 = _safe_float(m.get("ma10"))
    ma20 = _safe_float(m.get("ma20"))
    last = _safe_float(m.get("last_price"))
    vr = _safe_float(m.get("volume_ratio"))
    tr = _safe_float(m.get("turnover_rate"))

    if pct is not None:
        parts.append(f"当日涨跌幅 {pct:.2f}%")
    if ret_5d is not None:
        parts.append(f"近5日涨幅 {ret_5d:.2f}%")
    if last is not None and ma5 is not None and ma10 is not None and ma20 is not None:
        if last >= ma5 >= ma10 >= ma20:
            parts.append("价格位于 MA5/MA10/MA20 之上且均线多头")
        elif last >= ma5 >= ma10:
            parts.append("短期均线趋势向上")
    if vr is not None:
        parts.append(f"量比 {vr:.2f}")
    if tr is not None:
        parts.append(f"换手率 {tr:.2f}%")
    return "；".join(parts) if parts else "短期动量与量能表现较好"

def _em_headers():
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": "https://quote.eastmoney.com/center/gridlist.html",
        "Origin": "https://quote.eastmoney.com",
        "Connection": "keep-alive",
    }

def _http_get(url: str, params: dict = None, headers: dict = None, timeout: float = 8.0):
    return _HTTP_SESSION.get(url, params=params, headers=headers or {}, timeout=timeout)

def _decode_response(r) -> str:
    """安全解码响应内容，处理 gzip/deflate/br/zstd 等各种压缩格式。"""
    # requests 通常会自动解压 gzip/deflate，但 brotli/zstd 有时失败
    # 先尝试 r.text（requests 自动解压路径）
    try:
        text = r.text
        if text and not text.startswith('\x1b') and not text.startswith('\x00'):
            return text
    except Exception:
        pass

    # 手动尝试解压
    raw = r.content
    if not raw:
        return ""

    # gzip
    try:
        import gzip
        return gzip.decompress(raw).decode("utf-8")
    except Exception:
        pass

    # zlib/deflate
    try:
        import zlib
        return zlib.decompress(raw).decode("utf-8")
    except Exception:
        pass

    # brotli（可选依赖）
    try:
        import brotli
        return brotli.decompress(raw).decode("utf-8")
    except Exception:
        pass

    # 最后兜底：强制 utf-8 忽略错误
    return raw.decode("utf-8", errors="replace")

def _em_request_json(url: str, params: dict, timeout: float = 8.0, retries: int = 3):
    """请求东财API，带重试机制"""
    last_err = None
    for attempt in range(retries):
        try:
            if attempt > 0:
                time.sleep(0.5 * attempt)  # 递增延迟

            r = _http_get(url, params=params, headers=_em_headers(), timeout=timeout)
            text = _decode_response(r)

            # Eastmoney 风控/异常时可能返回 HTML
            if text.lstrip().startswith("<"):
                last_err = RuntimeError(f"Eastmoney returned HTML, status={r.status_code}, head={text[:80]!r}")
                continue

            if not text.strip():
                last_err = RuntimeError(f"Eastmoney returned empty body, status={r.status_code}")
                continue

            try:
                import json as _json
                return _json.loads(text)
            except Exception as e:
                last_err = RuntimeError(f"Eastmoney JSON decode failed, status={r.status_code}, err={e}, head={text[:80]!r}")
                continue

        except requests.exceptions.Timeout as e:
            last_err = RuntimeError(f"Request timeout: {e}")
            continue
        except requests.exceptions.RequestException as e:
            last_err = RuntimeError(f"Request failed: {e}")
            continue
    
    raise last_err if last_err else RuntimeError("Request failed after retries")

def _em_spot_a_share():
    """获取沪深 A 股全市场行情（分页拉取），失败则用新浪兜底。"""
    # ── 优先：东财 clist 分页直至取完 ──
    try:
        url = "https://push2.eastmoney.com/api/qt/clist/get"
        out = []
        seen = set()
        pz = 500
        for pn in range(1, 20):
            params = {
                "pn": pn, "pz": pz, "po": 1, "np": 1,
                "fltt": 2, "invt": 2, "fid": "f6",
                "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
                "fields": "f12,f14,f2,f3,f8,f10,f6",
            }
            data = _em_request_json(url, params=params, timeout=12.0, retries=2)
            diff = (((data or {}).get("data") or {}).get("diff")) or []
            if not diff:
                break
            for it in diff:
                code = str(it.get("f12") or "").strip()
                name = str(it.get("f14") or "").strip()
                if not code or not name or name.startswith("\ufffd") or code in seen:
                    continue
                seen.add(code)
                out.append({
                    "代码": code, "名称": name,
                    "最新价": _safe_float(it.get("f2")),
                    "涨跌幅": _safe_float(it.get("f3")),
                    "换手率": _safe_float(it.get("f8")),
                    "量比": _safe_float(it.get("f10")),
                    "成交额": _safe_float(it.get("f6")),
                })
            if len(diff) < pz:
                break
        # 东财偶发只返回少量页，不足则继续走新浪补全
        if len(out) >= 800:
            return out
        em_partial = out
    except Exception:
        em_partial = []

    # ── 备用/补全：新浪财经 hs_a 分页 ──
    import json as _json
    out = list(em_partial or [])
    seen = set(str(x.get("代码") or "") for x in out)
    sina_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.sina.com.cn/",
        "Accept-Encoding": "identity",
    }
    url2 = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
    for page in range(1, 35):
        try:
            p2 = {"page": page, "num": 200, "sort": "amount", "asc": 0,
                  "node": "hs_a", "symbol": "", "_s_r_a": "page"}
            r2 = _http_get(url2, params=p2, headers=sina_headers, timeout=8)
            r2.encoding = "utf-8"
            text2 = r2.text.strip()
            if not text2 or text2.startswith("<") or text2 == "[]":
                break
            items2 = _json.loads(text2)
            if not items2:
                break
            for it in items2:
                code = str(it.get("code") or "").strip()
                name = str(it.get("name") or "").strip()
                if not code or not name or code in seen:
                    continue
                seen.add(code)
                out.append({
                    "代码": code, "名称": name,
                    "最新价": _safe_float(it.get("trade")),
                    "涨跌幅": _safe_float(it.get("changepercent")),
                    "换手率": _safe_float(it.get("turnoverratio")),
                    "量比": _safe_float(it.get("volumeRatio")) or 1.0,  # 新浪无量比，默认1.0
                    "成交额": _safe_float(it.get("amount")),
                })
        except Exception:
            break
    return out

def _em_secid(symbol: str) -> str:
    s = (symbol or "").strip()
    if len(s) < 6:
        return ""
    if s.startswith("6"):
        return f"1.{s}"
    if s.startswith("8") or s.startswith("4"):
        # 北交所
        return f"0.{s}"
    return f"0.{s}"

def _parallel_row_scan(
    rows: List,
    eval_fn,
    max_workers: int = 16,
) -> List[dict]:
    """对 spot 初筛后的全量候选并行拉 K 线并评分（不在此阶段截断条数）。"""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if not rows:
        return []
    results: List[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(eval_fn, row) for row in rows]
        for fut in as_completed(futures):
            try:
                item = fut.result()
            except Exception:
                item = None
            if item:
                results.append(item)
    return results

def _sina_kline(symbol: str, lmt: int = 35):
    """新浪日 K 兜底（东财 K 线失败时使用）。"""
    s = (symbol or "").strip()
    if len(s) < 6:
        return {"dates": [], "ohlc": []}
    sym = f"sh{s}" if s.startswith("6") else f"sz{s}"
    url = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData"
    params = {"symbol": sym, "scale": 240, "ma": "no", "datalen": int(lmt)}
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://finance.sina.com.cn/",
        "Accept-Encoding": "identity",
    }
    try:
        r = _http_get(url, params=params, headers=headers, timeout=6.0)
        r.encoding = "utf-8"
        txt = (r.text or "").strip()
        if not txt or txt.startswith("<") or txt == "[]":
            return {"dates": [], "ohlc": []}
        import json as _json
        arr = _json.loads(txt)
        dates = []
        ohlc = []
        for row in arr or []:
            d = str(row.get("day") or "")
            o = _safe_float(row.get("open"))
            c = _safe_float(row.get("close"))
            l = _safe_float(row.get("low"))
            h = _safe_float(row.get("high"))
            if not d or o is None or c is None or l is None or h is None:
                continue
            dates.append(d)
            ohlc.append([o, c, l, h])
        return {"dates": dates, "ohlc": ohlc}
    except Exception:
        return {"dates": [], "ohlc": []}

def _em_kline_by_secid(secid: str, klt: int, lmt: int, timeout: float = 6.0, retries: int = 2):
    """按东财 secid 拉取 K 线（个股或指数）。"""
    if not secid:
        return {"dates": [], "ohlc": []}
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": secid,
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": klt,
        "fqt": 1,
        "lmt": lmt,
        "end": "20500101",
    }
    try:
        js = _em_request_json(url, params=params, timeout=timeout, retries=retries)
        kl = (((js or {}).get("data") or {}).get("klines")) or []
        dates = []
        ohlc = []
        for line in kl:
            parts = str(line).split(",")
            if len(parts) < 5:
                continue
            d = parts[0]
            o = _safe_float(parts[1])
            c = _safe_float(parts[2])
            h = _safe_float(parts[3])
            l = _safe_float(parts[4])
            if not d or o is None or c is None or h is None or l is None:
                continue
            dates.append(d)
            ohlc.append([o, c, l, h])
        if ohlc:
            return {"dates": dates, "ohlc": ohlc}
    except Exception:
        pass
    return {"dates": [], "ohlc": []}

def _em_kline(symbol: str, klt: int, lmt: int, timeout: float = 6.0, retries: int = 2):
    secid = _em_secid(symbol)
    if not secid:
        return {"dates": [], "ohlc": []}
    out = _em_kline_by_secid(secid, klt=klt, lmt=lmt, timeout=timeout, retries=retries)
    if out.get("ohlc"):
        return out
    return _sina_kline(symbol, lmt=lmt)

def _assess_hs300_market() -> dict:
    """
    以沪深300日K评估大盘环境，供月K策略门控。
    regime: healthy | caution | weak | unknown
    weak 时不允许新建仓推荐；caution 时提高匹配门槛。
    """
    k = _em_kline_by_secid("1.000300", klt=101, lmt=80, timeout=6.0, retries=2)
    ohlc = (k or {}).get("ohlc") or []
    closes = [_safe_float(x[1]) for x in ohlc if isinstance(x, list) and len(x) >= 2]
    closes = [x for x in closes if x is not None]
    if len(closes) < 25:
        return {
            "index": "000300",
            "index_name": "沪深300",
            "regime": "unknown",
            "allow_recommend": True,
            "day_pct": None,
            "ret_5d": None,
            "ret_10d": None,
            "ret_20d": None,
            "below_ma20": None,
            "below_ma60": None,
            "message": "沪深300行情暂不可用，本次未启用大盘硬过滤",
        }

    last = float(closes[-1])
    prev = float(closes[-2]) if len(closes) >= 2 else last
    day_pct = ((last / prev) - 1.0) * 100.0 if prev else 0.0
    ma20 = _calc_ma_list(closes, 20)
    ma60 = _calc_ma_list(closes, 60) if len(closes) >= 60 else None
    ret_5d = _calc_ret_pct_list(closes, 5)
    ret_10d = _calc_ret_pct_list(closes, 10)
    ret_20d = _calc_ret_pct_list(closes, 20)
    below_ma20 = bool(ma20 is not None and last < ma20)
    below_ma60 = bool(ma60 is not None and last < ma60) if ma60 is not None else None

    reasons: List[str] = []
    soft_notes: List[str] = []
    weak = False
    caution = False

    if day_pct <= -1.8:
        weak = True
        reasons.append(f"当日跌幅约 {day_pct:.2f}%")
    elif day_pct <= -0.8:
        caution = True
        reasons.append(f"当日偏弱约 {day_pct:.2f}%")

    if ma20 is not None and last < ma20 * 0.985:
        if ret_5d is not None and ret_5d < -3.0:
            weak = True
            reasons.append(f"显著低于MA20且近5日约 {ret_5d:.2f}%")
        else:
            caution = True
            reasons.append("价格明显低于MA20")
    elif below_ma20:
        # 仅略低于MA20：提示，不抬高匹配门槛（避免日常筛空）
        soft_notes.append("价格略低于MA20")

    if ret_10d is not None and ret_10d < -6.0:
        weak = True
        reasons.append(f"近10日约 {ret_10d:.2f}%")
    elif ret_5d is not None and ret_5d < -2.0:
        # Avoid duplicating「近5日约 x%」when MA20 weak reason already includes it.
        already_5d = any("近5日约" in r for r in reasons)
        if not already_5d:
            caution = True
            reasons.append(f"近5日约 {ret_5d:.2f}%")

    if ma60 is not None and last < ma60 * 0.97 and ret_20d is not None and ret_20d < -4.0:
        weak = True
        reasons.append(f"显著低于MA60且近20日约 {ret_20d:.2f}%")

    # 去重并保序
    seen = set()
    uniq_reasons = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            uniq_reasons.append(r)

    if weak:
        regime = "weak"
        allow = False
        msg = "大盘偏弱，暂不推荐新建仓（沪深300：" + "；".join(uniq_reasons[:3]) + "）"
    elif caution:
        regime = "caution"
        allow = True
        msg = "大盘谨慎观察（沪深300：" + "；".join(uniq_reasons[:3]) + "）。已提高匹配门槛。"
    else:
        regime = "healthy"
        allow = True
        if soft_notes:
            msg = f"沪深300环境尚可（当日约 {day_pct:.2f}%；" + "；".join(soft_notes[:2]) + "）"
        else:
            msg = f"沪深300环境尚可（当日约 {day_pct:.2f}%）"

    return {
        "index": "000300",
        "index_name": "沪深300",
        "regime": regime,
        "allow_recommend": allow,
        "day_pct": round(day_pct, 2),
        "ret_5d": round(ret_5d, 2) if ret_5d is not None else None,
        "ret_10d": round(ret_10d, 2) if ret_10d is not None else None,
        "ret_20d": round(ret_20d, 2) if ret_20d is not None else None,
        "below_ma20": below_ma20,
        "below_ma60": below_ma60,
        "message": msg,
    }

def _em_clist_code_set(fs: str, pz: int = 500, max_pages: int = 15) -> set:
    """东财 clist 分页拉取股票代码集合（f12）。"""
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    out: set = set()
    for pn in range(1, max_pages + 1):
        params = {
            "pn": pn,
            "pz": pz,
            "po": 1,
            "np": 1,
            "fltt": 2,
            "invt": 2,
            "fid": "f6",
            "fs": fs,
            "fields": "f12,f14",
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }
        data = _em_request_json(url, params=params, timeout=12.0, retries=2)
        diff = (((data or {}).get("data") or {}).get("diff")) or []
        if not diff:
            break
        for it in diff:
            c = str((it or {}).get("f12") or "").strip()
            if len(c) >= 6:
                out.add(c)
        if len(diff) < pz:
            break
    return out

def _get_hs300_zz500_universe() -> set:
    """沪深300 + 中证500 成分并集；失败或过少时返回空集合（由上层走成交额替代池）。"""
    now = time.time()
    ttl = 6 * 3600.0
    cached = _INDEX_HS300_ZZ500_CACHE.get("codes")
    if isinstance(cached, set) and cached and (now - float(_INDEX_HS300_ZZ500_CACHE.get("ts") or 0.0)) < ttl:
        return cached
    merged: set = set()
    # 东财板块：沪深300 / 中证500（若板块代码变更，集合可能偏少，上层有兜底）
    for fs in ("b:BK0500", "b:BK0701"):
        try:
            merged |= _em_clist_code_set(fs, pz=500, max_pages=12)
        except Exception:
            continue
    _INDEX_HS300_ZZ500_CACHE["ts"] = now
    _INDEX_HS300_ZZ500_CACHE["codes"] = merged
    return merged

def _em_stock_snapshot(symbol: str) -> Optional[dict]:
    """东财个股快照（现价、昨收等），用于当日再诊断。"""
    secid = _em_secid(symbol)
    if not secid:
        return None
    url = "https://push2.eastmoney.com/api/qt/stock/get"
    params = {
        "invt": 2,
        "fltt": 2,
        "secid": secid,
        "fields": "f43,f44,f45,f46,f60,f58,f170,f57,f14",
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
    }
    js = _em_request_json(url, params=params, timeout=8.0, retries=2)
    data = (js or {}).get("data") or {}
    if not data:
        return None

    def em_px(field: str) -> Optional[float]:
        v = _safe_float(data.get(field))
        if v is None:
            return None
        return round(v / 100.0, 4)

    last = em_px("f43")
    prev = em_px("f60")
    open_p = em_px("f46")
    high = em_px("f44")
    low = em_px("f45")
    name = str(data.get("f14") or "").strip()
    pct_change = None
    if last is not None and prev is not None and prev > 0:
        pct_change = round((last / prev - 1.0) * 100.0, 4)

    return {
        "name": name,
        "last_price": last,
        "prev_close": prev,
        "open": open_p,
        "high": high,
        "low": low,
        "pct_change": pct_change,
    }

def _is_tail_buy_live_window() -> bool:
    """交易日 14:50~14:59 为正式尾盘窗口。"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    return now.hour == 14 and 50 <= now.minute <= 59

@router.get("/recommend-tail-buy")
def stocks_recommend_tail_buy(only_basic: int = 1, _admin: dict = Depends(_admin_user)):
    """
    强势弹性（隔夜）：当日确认偏强+放量+收盘贴高，尾盘买入博弈次日早盘溢价。
    路径名保留 recommend-tail-buy 以兼容旧前端；策略字段为 strong_momentum。
    """
    _ = _admin
    return _with_empty_result_retry(_compute_strong_momentum, bool(int(only_basic or 0)))

def _bg_update_tail_buy():
    try:
        _compute_strong_momentum(only_basic=True)
    except Exception as e:
        print(f"[BG] 强势弹性更新失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        _TAIL_BUY_CACHE["updating"] = False

def _compute_strong_momentum(only_basic: bool = True):
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    market = _assess_hs300_market()
    in_live_window = _is_tail_buy_live_window()
    buy_date, sell_date = _tail_buy_trade_dates()

    if not market.get("allow_recommend", True):
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "strong_momentum",
            "items": [],
            "no_retry": True,
            "in_live_window": in_live_window,
            "market_regime": market,
            "message": market.get("message") or "大盘偏弱，暂不推荐强势弹性隔夜",
        }

    idx_codes = _get_hs300_zz500_universe()
    use_index = len(idx_codes) >= 120

    try:
        spot = _em_spot_a_share()
    except Exception as e:
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "strong_momentum",
            "items": [],
            "in_live_window": in_live_window,
            "market_regime": market,
            "message": f"获取A股行情失败：{e}",
        }

    import pandas as pd
    df = pd.DataFrame(spot) if not hasattr(spot, "columns") else spot.copy()
    if df is None or (hasattr(df, "empty") and df.empty):
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "strong_momentum",
            "items": [],
            "in_live_window": in_live_window,
            "market_regime": market,
            "message": "获取A股行情为空",
        }

    df["__price"] = df["最新价"].map(_safe_float)
    df["__pct"] = df["涨跌幅"].map(_safe_float)
    df["__turn"] = df["换手率"].map(_safe_float)
    df["__vr"] = df["量比"].map(_safe_float)
    df["__amount"] = df["成交额"].map(_safe_float)
    df = df.dropna(subset=["__price"])

    try:
        df = df[df["代码"].map(_is_tradable_stock)]
    except Exception:
        pass
    try:
        df = df[~df["名称"].astype(str).map(_is_risky_stock_name)]
    except Exception:
        pass

    pool_note = "沪深300+中证500成分股"
    if use_index:
        try:
            df = df[df["代码"].astype(str).isin(idx_codes)]
        except Exception:
            use_index = False
    if not use_index:
        pool_note = "主板高流动性替代池（指数成分拉取不足时）"

    is_trade_time = _is_a_share_trade_time()
    caution = market.get("regime") == "caution"
    min_amount = 1.2e8 if use_index else 1.8e8

    # 初筛：当日偏强（非贴板），放量
    if is_trade_time:
        df_scan = df[
            (df["__amount"].fillna(0) >= min_amount) &
            (df["__price"].fillna(0) >= 3.0) &
            (df["__pct"].fillna(0) >= 2.0) &
            (df["__pct"].fillna(0) <= 7.5) &
            (df["__vr"].fillna(0) >= 1.1) &
            (df["__vr"].fillna(0) <= 4.8) &
            (df["__turn"].fillna(0) >= 0.35) &
            (df["__turn"].fillna(0) <= 18.0)
        ]
    else:
        df_scan = df[
            (df["__amount"].fillna(0) >= min_amount) &
            (df["__price"].fillna(0) >= 3.0) &
            (df["__pct"].fillna(0) >= 2.0) &
            (df["__pct"].fillna(0) <= 7.5) &
            (df["__turn"].fillna(0) >= 0.35) &
            (df["__turn"].fillna(0) <= 18.0)
        ]
    df_scan = df_scan.sort_values("__pct", ascending=False).head(90)
    scan_rows = [row for _, row in df_scan.iterrows()]

    candidates = _parallel_row_scan(
        scan_rows,
        lambda row: _strong_momentum_eval_row(row, is_trade_time),
        max_workers=8,
    )
    fit_min = _strategy_fit_min("strong_momentum", is_trade_time)
    if caution:
        fit_min = float(fit_min) + 3.0
    top = _apply_sorted_picks(
        candidates,
        only_basic=True,
        min_score=fit_min,
        is_trade_time=is_trade_time,
        strategy="strong_momentum",
        max_results=0,
    )

    items = []
    for r in top:
        if _stock_negative_news_hit(r.get("symbol")):
            continue
        metrics = {
            "last_price": r["price"],
            "pct_change": r["pct"],
            "turnover_rate": r["turn"],
            "volume_ratio": r["vr"],
            "ma5": r["ma5"],
            "ma10": r["ma10"],
            "ma20": r["ma20"],
            "ret_3d": r.get("ret_3d"),
            "ret_5d": r["ret_5d"],
            "ret_20d": r.get("ret_20d"),
            "near_high_60d_pct": r.get("near_high_ratio"),
            "close_vs_high_pct": r.get("close_vs_high"),
        }
        items.append(_attach_market_fields({
            "symbol": r["symbol"],
            "name": r["name"],
            "match_score": _round_match_score(r.get("score")),
            "metrics": metrics,
            "reason": _reason_text(metrics),
            "buy_time_suggest": f"{buy_date} 14:50~14:59（确认分时仍强、未大幅回落）",
            "sell_time_suggest": f"{sell_date} 09:30~10:00（冲高优先了结，走弱随时走）",
            "hold_days_suggest": "隔夜为主（最多观察至次日上午）",
            "summary": (
                f"强势弹性：{pool_note}；偏好当日涨约 2%~7.5%、放量、收盘贴近日高、短均线多头的标的。"
                f"建议 {buy_date} 尾盘买、{sell_date} 早盘卖。搏次日溢价，波动更大，不保证上涨。"
            ),
            "prior_up_days": r.get("prior_up_days"),
            "match_tier": "strong_momentum",
            "universe_note": pool_note,
        }))
        if len(items) >= STOCK_PICK_MAX:
            break

    market_msg = (market.get("message") or "").strip()
    window_note = (
        "【尾盘实时窗口】"
        if in_live_window
        else "【预览模式】非 14:50~14:59，数据非尾盘实时；正式下单请到点再点一次确认。"
    )
    if items:
        msg_core = f"共 {len(items)} 只（强势弹性隔夜，最多 {STOCK_PICK_MAX} 条）"
    else:
        msg_core = "当前暂无符合强势弹性条件的标的"
    msg_parts = [window_note, f"【{pool_note}】", msg_core]
    if market_msg:
        msg_parts.append(market_msg)

    return {
        "success": True if items else False,
        "generated_at": generated_at,
        "strategy": "strong_momentum",
        "items": items,
        "no_retry": True,
        "is_trade_time": is_trade_time,
        "in_live_window": in_live_window,
        "market_regime": market,
        "buy_date": buy_date,
        "sell_date": sell_date,
        "message": " ".join(msg_parts).strip(),
    }

def _monthly_recovery_fit_score(
    pos_ratio, ret_1m, ret_3m, ret_6m, last_month_close, ma5m, ma10m, pct, vr,
    drawdown_18m=None,
) -> float:
    s = 0.0
    if pos_ratio is not None:
        s += max(0.0, (0.58 - float(pos_ratio)) * 100.0) * 0.30
    if drawdown_18m is not None:
        s += min(16.0, max(0.0, float(drawdown_18m) - 12.0) * 0.55)
    s += min(16.0, max(0.0, ret_1m or 0.0)) * 0.90
    s += min(18.0, max(0.0, ret_3m or 0.0)) * 0.55
    if ret_6m is not None and ret_6m >= 0:
        s += min(10.0, ret_6m * 0.30)
    if ma5m and ma10m and last_month_close >= ma5m >= ma10m * 0.98:
        s += 14.0
    elif ma5m and last_month_close >= ma5m * 0.99:
        s += 8.0
    s += _fit_in_range(pct, -2.0, 5.0, pad=1.2) * 10.0
    s += _fit_in_range(vr, 0.35, 2.8, pad=1.0) * 8.0
    return s

def _monthly_recovery_eval_row(row):
    code = str(row.get("代码") or "").strip()
    name = str(row.get("名称") or "").strip()
    # 强制：主板可交易 + 排除 ST/退市整理等名称风险
    if not code or not name or _is_risky_stock_name(name) or not _is_tradable_stock(code):
        return None
    # 负面公告排雷（退市/立案/造假等）；接口失败则跳过此项
    if _stock_negative_news_hit(code):
        return None

    try:
        month_k = _em_kline(code, klt=103, lmt=36, timeout=6.0, retries=1)
    except Exception:
        return None
    if not month_k or not month_k.get("ohlc"):
        return None

    month_ohlc = month_k.get("ohlc") or []
    month_closes = [_safe_float(x[1]) for x in month_ohlc if isinstance(x, list) and len(x) >= 2]
    month_highs = [_safe_float(x[3]) for x in month_ohlc if isinstance(x, list) and len(x) >= 4]
    month_lows = [_safe_float(x[2]) for x in month_ohlc if isinstance(x, list) and len(x) >= 3]
    month_closes = [x for x in month_closes if x is not None]
    month_highs = [x for x in month_highs if x is not None]
    month_lows = [x for x in month_lows if x is not None]
    if len(month_closes) < 18 or not month_highs or not month_lows:
        return None

    last_month_close = month_closes[-1]
    month_low_18 = min(month_lows[-18:])
    month_high_18 = max(month_highs[-18:])
    if month_low_18 <= 0 or month_high_18 <= 0:
        return None

    range_ratio = (month_high_18 - month_low_18) / month_low_18
    span = month_high_18 - month_low_18
    pos_ratio = (last_month_close - month_low_18) / span if span > 0 else 1.0
    drawdown_18m = (1.0 - last_month_close / month_high_18) * 100.0 if month_high_18 > 0 else 0.0

    # 超跌底部：位置偏低，且相对 18 个月高点有足够回撤
    if range_ratio > 2.8 or pos_ratio > 0.58:
        return None
    if drawdown_18m < 16.0:
        return None

    ret_1m = _calc_ret_pct_list(month_closes, 1) if len(month_closes) > 1 else None
    ret_3m = _calc_ret_pct_list(month_closes, 3) if len(month_closes) > 3 else None
    ret_6m = _calc_ret_pct_list(month_closes, 6) if len(month_closes) > 6 else None
    if ret_1m is None or ret_3m is None:
        return None
    # 避免长期趴底：近1/3月至少一方转正，且不能双双深跌
    if ret_1m < -3.0 or ret_3m < -6.0:
        return None
    if max(ret_1m, ret_3m) < 0.0:
        return None

    recent_low_3 = min(month_lows[-3:]) if len(month_lows) >= 3 else month_low_18
    if last_month_close < recent_low_3 * 1.01:
        return None

    ma5m = _calc_ma_list(month_closes, 5)
    ma10m = _calc_ma_list(month_closes, 10)
    if ma5m is None or ma10m is None:
        return None
    if last_month_close < ma5m * 0.94:
        return None

    try:
        day_k = _em_kline(code, klt=101, lmt=90, timeout=5.0, retries=1)
    except Exception:
        return None
    if not day_k or not day_k.get("ohlc"):
        return None

    day_closes = [_safe_float(x[1]) for x in (day_k.get("ohlc") or []) if isinstance(x, list) and len(x) >= 2]
    day_closes = [x for x in day_closes if x is not None]
    if len(day_closes) < 30:
        return None

    ret_10d = _calc_ret_pct_list(day_closes, 10)
    ret_20d = _calc_ret_pct_list(day_closes, 20)
    if ret_10d is not None and ret_10d > 22.0:
        return None

    pct = _safe_float(row.get("__pct"))
    turn = _safe_float(row.get("__turn"))
    vr = _safe_float(row.get("__vr"))
    price = _safe_float(row.get("__price"))
    amt = _safe_float(row.get("__amount"))
    if price is not None and price < 3.0:
        return None

    score = _monthly_recovery_fit_score(
        pos_ratio, ret_1m, ret_3m, ret_6m, last_month_close, ma5m, ma10m, pct, vr,
        drawdown_18m=drawdown_18m,
    )
    return {
        "symbol": code,
        "name": name,
        "score": score,
        "price": price,
        "pct": pct,
        "turn": turn,
        "vr": vr,
        "amount": amt,
        "ma5": _calc_ma_list(day_closes, 5),
        "ma10": _calc_ma_list(day_closes, 10),
        "ma20": _calc_ma_list(day_closes, 20),
        "ret_5d": _calc_ret_pct_list(day_closes, 5),
        "ret_20d": ret_20d,
        "ret_1m": ret_1m,
        "ret_3m": ret_3m,
        "ret_6m": ret_6m,
        "month_pos_ratio": round(pos_ratio * 100.0, 2),
        "month_range_ratio": round(range_ratio * 100.0, 2),
        "drawdown_18m": round(drawdown_18m, 2),
    }

@router.get("/recommend-monthly-recovery")
def stocks_recommend_monthly_recovery(only_basic: int = 1, _admin: dict = Depends(_admin_user)):
    _ = _admin
    # 单人自用：不做结果缓存，每次点击重新计算
    return _with_empty_result_retry(_compute_monthly_recovery, bool(int(only_basic or 0)))

def _bg_update_monthly_recovery():
    try:
        _compute_monthly_recovery(only_basic=True)
    except Exception as e:
        print(f"[BG] 月K底部启动更新失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        _MONTHLY_RECOVERY_CACHE["updating"] = False

def _compute_monthly_recovery(only_basic: bool = True):
    market = _assess_hs300_market()
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not market.get("allow_recommend", True):
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "monthly_recovery",
            "items": [],
            "no_retry": True,
            "market_regime": market,
            "message": market.get("message") or "大盘偏弱，暂不推荐",
        }

    idx_codes = _get_hs300_zz500_universe()
    use_index = len(idx_codes) >= 120

    try:
        spot = _em_spot_a_share()
    except Exception as e:
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "monthly_recovery",
            "items": [],
            "market_regime": market,
            "message": f"行情获取失败：{e}",
        }

    import pandas as pd
    df = pd.DataFrame(spot)
    if df.empty:
        return {
            "success": False,
            "generated_at": generated_at,
            "strategy": "monthly_recovery",
            "items": [],
            "market_regime": market,
            "message": "行情为空",
        }

    df["__price"] = df["最新价"].map(_safe_float)
    df["__pct"] = df["涨跌幅"].map(_safe_float)
    df["__turn"] = df["换手率"].map(_safe_float)
    df["__vr"] = df["量比"].map(_safe_float)
    df["__amount"] = df["成交额"].map(_safe_float)
    df = df.dropna(subset=["__price"])

    # 月K：始终排除创业/科创/北交所与 ST 等（降低退市相关风险）
    try:
        df = df[df["代码"].map(_is_tradable_stock)]
    except Exception:
        pass
    try:
        df = df[~df["名称"].astype(str).map(_is_risky_stock_name)]
    except Exception:
        pass

    pool_note = "沪深300+中证500成分股"
    if use_index:
        try:
            df = df[df["代码"].astype(str).isin(idx_codes)]
        except Exception:
            use_index = False
    if not use_index:
        pool_note = "主板大盘流动性替代池（指数成分拉取不足时）"

    min_amount = 1.0e8 if use_index else 1.8e8
    df_scan = df[
        (df["__amount"].fillna(0) >= min_amount) &
        (df["__price"].fillna(0) >= 3.0) &
        (df["__pct"].fillna(0) >= -3.5) &
        (df["__pct"].fillna(0) <= 6.0) &
        (df["__vr"].fillna(0) >= 0.25) &
        (df["__vr"].fillna(0) <= 3.5) &
        (df["__turn"].fillna(0) >= 0.05) &
        (df["__turn"].fillna(0) <= 8.0)
    ].sort_values("__amount", ascending=False).head(100)
    # 成分池过窄时，放宽成交额再补一批（仍保持价位门槛）
    if use_index and len(df_scan) < 40:
        extra = df[
            (df["__amount"].fillna(0) >= 5e7) &
            (df["__price"].fillna(0) >= 3.0) &
            (df["__pct"].fillna(0) >= -4.5) &
            (df["__pct"].fillna(0) <= 7.0)
        ].sort_values("__amount", ascending=False).head(100)
        df_scan = pd.concat([df_scan, extra]).drop_duplicates(subset=["代码"]).head(100)

    scan_rows = [row for _, row in df_scan.iterrows()]
    candidates = _parallel_row_scan(scan_rows, _monthly_recovery_eval_row, max_workers=8)

    fit_min = _strategy_fit_min("monthly_recovery")
    if market.get("regime") == "caution":
        fit_min = float(fit_min) + 3.0
    # 严格阈值，不放宽；最多 STOCK_PICK_MAX 条
    top = _apply_sorted_picks(
        candidates,
        only_basic=True,
        min_score=fit_min,
        strategy="monthly_recovery",
        max_results=STOCK_PICK_MAX,
    )

    items = []
    for r in top:
        metrics = {
            "last_price": r["price"],
            "pct_change": r["pct"],
            "turnover_rate": r["turn"],
            "volume_ratio": r["vr"],
            "ma5": r["ma5"],
            "ma10": r["ma10"],
            "ma20": r["ma20"],
            "ret_5d": r["ret_5d"],
            "ret_20d": r["ret_20d"],
            "ret_1m": r["ret_1m"],
            "ret_3m": r["ret_3m"],
            "ret_6m": r["ret_6m"],
            "month_pos_ratio": r["month_pos_ratio"],
            "drawdown_18m": r.get("drawdown_18m"),
        }
        ret_1m_txt = f"{r['ret_1m']:.2f}%" if r.get("ret_1m") is not None else "-"
        ret_3m_txt = f"{r['ret_3m']:.2f}%" if r.get("ret_3m") is not None else "-"
        pos_txt = f"{r['month_pos_ratio']:.1f}%" if r.get("month_pos_ratio") is not None else "-"
        dd_txt = f"{r['drawdown_18m']:.1f}%" if r.get("drawdown_18m") is not None else "-"
        items.append(_attach_market_fields({
            "symbol": r["symbol"],
            "name": r["name"],
            "match_score": _round_match_score(r.get("score")),
            "metrics": metrics,
            "hold_days_suggest": "观察3~12个月（需止损与仓位上限；不保证一年内大涨）",
            "summary": (
                f"月K底部超跌启动：{pool_note}；距18个月高点回撤约 {dd_txt}，"
                f"区间位置约 {pos_txt}，近1月 {ret_1m_txt}、近3月 {ret_3m_txt}。"
                f"已强制主板、排除 ST/退市整理/创业板/科创板/北交所，"
                f"并过滤近期含退市/立案/造假等负面公告的标的；同时要求企稳启动迹象。"
                f"不构成投资建议，不能保证无退市或一年内大涨。"
            ),
            "reason": _reason_text(metrics),
            "month_pos_ratio": r.get("month_pos_ratio"),
            "drawdown_18m": r.get("drawdown_18m"),
            "universe_note": pool_note,
        }))

    market_msg = (market.get("message") or "").strip()
    if items:
        msg_extra = f"共 {len(items)} 只（最多 {STOCK_PICK_MAX} 条，严格筛选）"
    else:
        msg_extra = "当前暂无符合「超跌底部+企稳启动+无退市加强」条件的标的"
    msg_parts = [f"【{pool_note}·超跌底部·无退市加强】", msg_extra]
    if market_msg:
        msg_parts.append(market_msg)
    return {
        "success": True if items else False,
        "generated_at": generated_at,
        "strategy": "monthly_recovery",
        "items": items,
        "no_retry": True,
        "market_regime": market,
        "message": " ".join(msg_parts).strip(),
    }

