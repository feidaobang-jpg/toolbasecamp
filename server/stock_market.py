"""Public market-data adapters. Quotes carry exchange timestamps; errors are explicit."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import math
import re
import threading
import time
from urllib.parse import urlsplit

import requests
from stock_calendar import CN_TZ

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "Referer": "https://finance.sina.com.cn/", "Accept-Encoding": "identity"}
# Public web-client identifier, not an account credential.
EASTMONEY_UT = "fa5fd1943c7b386f172d6893dbfba10b"
SPOT_URLS = ("https://push2delay.eastmoney.com/api/qt/clist/get",
             "https://push2.eastmoney.com/api/qt/clist/get")
_spot_lock = threading.Lock()
_spot_cache = {}
NEGATIVE_WORDS = ("退市", "立案调查", "立案告知", "财务造假", "欺诈发行", "破产清算", "债务违约", "无法表示意见", "否定意见", "重大违法", "风险警示")


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def get_text(url, params=None):
    last = None
    headers = dict(HEADERS)
    host = urlsplit(url).hostname or ""
    if host.endswith(".eastmoney.com"):
        headers["Referer"] = "https://data.eastmoney.com/" if host.startswith(("np-anotice-stock.", "datacenter.")) else "https://quote.eastmoney.com/center/gridlist.html"
        headers.pop("Accept-Encoding", None)
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, headers=headers, timeout=(4, 8))
            response.raise_for_status()
            try:
                return response.content.decode("utf-8")
            except UnicodeDecodeError:
                return response.content.decode("gb18030")
        except requests.RequestException as exc:
            last = exc
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    source = "东方财富公告" if host.startswith("np-anotice-stock.") else "东方财富行情" if host.endswith(".eastmoney.com") else "新浪行情"
    raise RuntimeError(source + "接口暂不可用，已重试，请稍后重试") from last


def get_json(url, params=None):
    try:
        return json.loads(get_text(url, params))
    except (ValueError, UnicodeError) as exc:
        raise RuntimeError("行情接口返回无效数据") from exc


def normal_stock(code, name):
    return bool(re.fullmatch(r"(?:000|001|002|003|600|601|603|605)\d{3}", code or "")) and bool(name) and "ST" not in name.upper() and "退" not in name


def spot_market():
    # Share only a recently fetched, complete snapshot; keep provider timestamps.
    # Expired cache is never a fallback for a failed live request.
    with _spot_lock:
        cached = _spot_cache.get("rows")
        if cached and time.monotonic() - _spot_cache["at"] < 30:
            return [dict(row) for row in cached]
        try:
            rows = _fetch_spot_market()
        except RuntimeError:
            rows = _sina_spot_market()
        _spot_cache.update(rows=rows, at=time.monotonic())
        return [dict(row) for row in rows]


def _fetch_spot_market():
    def page(pn):
        params = {"pn": pn, "pz": 100, "po": 1, "np": 1, "fltt": 2, "invt": 2,
            "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
            "fields": "f12,f14,f2,f3,f8,f6,f100,f124", "ut": EASTMONEY_UT, "fid": "f6"}
        last = None
        for url in SPOT_URLS:
            try:
                payload = get_json(url, params).get("data") or {}
                if not payload.get("diff") or not payload.get("total"):
                    raise RuntimeError("全市场行情返回空分页")
                break
            except RuntimeError as exc:
                last = exc
        else:
            raise RuntimeError("全市场行情主备接口暂不可用，已重试；暂停筛选") from last
        diff = payload.get("diff") or []
        return int(payload.get("total") or 0), list(diff.values()) if isinstance(diff, dict) else diff
    total, first = page(1)
    if total < 3000 or not first:
        raise RuntimeError("全市场行情不完整，暂停筛选")
    pages = math.ceil(total / len(first))
    if pages > 100:
        raise RuntimeError("行情分页异常")
    with ThreadPoolExecutor(max_workers=4) as pool:
        chunks = list(pool.map(page, range(2, pages + 1)))
    raw = first + [row for _, chunk in chunks for row in chunk]
    unique = {str(r.get("f12")): r for r in raw if r.get("f12")}
    if len(unique) < total * 0.98:
        raise RuntimeError("全市场行情分页缺失，暂停筛选")
    return [{"symbol": str(r["f12"]), "name": str(r.get("f14") or ""),
             "price": number(r.get("f2")), "pct": number(r.get("f3")),
             "amount": number(r.get("f6")), "turnover": number(r.get("f8")),
             "sector": str(r.get("f100") or ""), "timestamp": number(r.get("f124")), "source": "东方财富实时行情"}
            for r in unique.values()]


def _sina_spot_market():
    """Use Eastmoney only for the universe/industry, never its undated prices."""
    catalog = []
    for pn in range(1, 41):
        payload = get_json("https://datacenter.eastmoney.com/stock/selection/api/data/get/", {
            "type": "RPTA_APP_STOCKSELECT", "sty": "SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY",
            "p": pn, "ps": 500, "st": "SECURITY_CODE", "sr": 1,
            "source": "WEB", "client": "WEB"})
        result = payload.get("result") or {}
        rows = result.get("data")
        if not payload.get("success") or not isinstance(rows, list) or result.get("currentpage") != pn:
            raise RuntimeError("备用行情股票行业名册核验失败，暂停筛选")
        catalog.extend(rows)
        if result.get("nextpage") is False:
            break
        if result.get("nextpage") is not True or not rows:
            raise RuntimeError("备用行情名册分页不完整，暂停筛选")
    else:
        raise RuntimeError("备用行情名册分页异常，暂停筛选")
    mainland = [r for r in catalog if re.fullmatch(r"[036]\d{5}", str(r.get("SECURITY_CODE") or ""))]
    unique = {r["SECURITY_CODE"]: r for r in mainland}
    if len(unique) < 3000 or len(unique) < len(mainland) * 0.98:
        raise RuntimeError("备用行情股票名册不完整，暂停筛选")
    symbols = sorted(unique)
    batches = [symbols[i:i+200] for i in range(0, len(symbols), 200)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        chunks = list(pool.map(quotes, batches))
    qmap = {symbol: q for chunk in chunks for symbol, q in chunk.items() if symbol in unique}
    if len(qmap) < len(unique) * 0.98:
        raise RuntimeError("备用实时行情覆盖不足，暂停筛选")
    rows = []
    for symbol, q in qmap.items():
        if symbol not in unique:
            continue
        r = unique[symbol]
        rows.append({"symbol": symbol, "name": q["name"], "price": q["last"],
            "pct": round((q["last"]/q["prev_close"]-1)*100, 2), "amount": q["amount"],
            "turnover": None, "sector": str(r.get("INDUSTRY") or ""),
            "timestamp": datetime.fromisoformat(q["at"]).timestamp(),
            "source": "新浪实时行情＋东方财富行业名册"})
    return rows


def daily_bars(symbol, limit=100):
    """Unadjusted OHLCV: never retroactively replace recorded fill prices."""
    secid = ("1." if symbol.startswith(("6", "sh")) else "0.") + symbol.removeprefix("sh").removeprefix("sz")
    try:
        payload = get_json("https://push2his.eastmoney.com/api/qt/stock/kline/get", {
            "secid": secid, "klt": 101, "fqt": 0, "lmt": limit, "end": "20500101",
            "fields1": "f1,f2,f3,f4,f5,f6", "fields2": "f51,f52,f53,f54,f55,f56,f57"})
        rows = []
        for line in (payload.get("data") or {}).get("klines") or []:
            p = line.split(",")
            if len(p) >= 7 and all(number(x) is not None for x in p[1:7]):
                rows.append(dict(date=p[0][:10], open=float(p[1]), close=float(p[2]), high=float(p[3]), low=float(p[4]), volume=float(p[5])*100, amount=float(p[6])))
        if rows:
            return rows
    except RuntimeError:
        pass
    sina_symbol = symbol if symbol.startswith(("sh", "sz")) else ("sh" if symbol.startswith("6") else "sz") + symbol
    payload = get_json("https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData", {
        "symbol": sina_symbol, "scale": 240, "ma": "no", "datalen": limit})
    rows = []
    for row in payload or []:
        if all(number(row.get(k)) is not None for k in ("open", "close", "high", "low", "volume")):
            rows.append({"date": str(row["day"])[:10], **{k: float(row[k]) for k in ("open", "close", "high", "low", "volume")}})
    if not rows:
        raise RuntimeError("日K数据缺失")
    return sorted(rows, key=lambda x: x["date"])


def quotes(symbols):
    if not symbols:
        return {}
    names = [s if s.startswith(("sh", "sz")) else ("sh" if s.startswith("6") else "sz") + s for s in symbols]
    text = get_text("https://hq.sinajs.cn/list=" + ",".join(names))
    result = {}
    for symbol, body in re.findall(r'var hq_str_(\w+)="([^"]*)"', text):
        p = body.split(",")
        if len(p) < 32:
            continue
        try:
            at = datetime.strptime(p[30]+" "+p[31], "%Y-%m-%d %H:%M:%S").replace(tzinfo=CN_TZ)
        except ValueError:
            continue
        if not number(p[3]) or not number(p[2]):
            continue
        key = symbol if symbol in symbols else symbol[2:]
        result[key] = {"symbol": key, "name": p[0], "open": number(p[1]), "prev_close": number(p[2]),
            "last": number(p[3]), "high": number(p[4]), "low": number(p[5]), "volume": number(p[8]),
            "amount": number(p[9]), "bid": number(p[11]), "bid_size": number(p[10]),
            "ask": number(p[21]), "ask_size": number(p[20]), "at": at.isoformat(), "source": "新浪实时买卖盘"}
    return result


def fresh_quote(q, now, max_age=120):
    if not q:
        return False
    try:
        at = datetime.fromisoformat(q["at"])
        age = (now - at).total_seconds()
        return at.date() == now.astimezone(CN_TZ).date() and -5 <= age <= max_age
    except (ValueError, TypeError, KeyError):
        return False


def announcements(symbol, day):
    payload = get_json("https://np-anotice-stock.eastmoney.com/api/security/ann", {
        "page_size": 30, "page_index": 1, "ann_type": "A", "stock_list": symbol, "client_source": "web"})
    if not isinstance(payload.get("data"), dict):
        raise RuntimeError("公告核验失败")
    rows = payload["data"].get("list")
    if not isinstance(rows, list):
        raise RuntimeError("公告列表不完整")
    latest = datetime.now(CN_TZ).date().isoformat()
    recent = [r for r in rows if day <= str(r.get("notice_date") or "")[:10] <= latest]
    titles = [str(r.get("title_ch") or r.get("title") or "") for r in recent]
    hits = [title for title in titles if any(word in title for word in NEGATIVE_WORDS)]
    return {"checked": True, "titles": titles, "negative": hits}
