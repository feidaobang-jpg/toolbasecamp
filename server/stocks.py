"""Admin-only pullback screening, immutable paper trades, and review exports."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import os
import re
from statistics import mean
import threading
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer
import stock_market as market_data
from stock_calendar import CN_TZ, CALENDAR_SOURCE, cn_now, phase_at, trade_days_between
from stock_strategy import RULES, VERSION, close_accounting, entry_order, evaluate_pullback, exit_reason, fees, money

router = APIRouter(prefix="/stocks", tags=["stocks"])
security = HTTPBearer(auto_error=False)
_get_current_user = _require_admin = _get_conn = _require_db = None
_preview_lock = threading.Lock()
_preview_cache = {}

def wire(get_current_user, require_admin, get_conn=None, require_db=None):
    global _get_current_user, _require_admin, _get_conn, _require_db
    _get_current_user, _require_admin, _get_conn, _require_db = get_current_user, require_admin, get_conn, require_db

def _admin_user(creds=Depends(security)):
    if _get_current_user is None:
        raise HTTPException(503, "股票后台尚未就绪")
    user = _get_current_user(creds)
    _require_admin(user)
    return user

@contextmanager
def db(write=False):
    if _get_conn is None:
        raise HTTPException(503, "数据库不可用")
    if _require_db:
        _require_db()
    conn = _get_conn()
    locked = False
    try:
        with conn.cursor() as cur:
            if write:
                cur.execute("SELECT GET_LOCK('stock-pullback-write', 0) AS acquired")
                locked = bool((cur.fetchone() or {}).get("acquired"))
                if not locked:
                    raise HTTPException(409, "另一次股票记录更新正在执行")
                conn.begin()
            yield cur
            if write:
                conn.commit()
    except BaseException:
        if write:
            conn.rollback()
        raise
    finally:
        if locked:
            with conn.cursor() as cur:
                cur.execute("SELECT RELEASE_LOCK('stock-pullback-write')")
        conn.close()

def ensure_stock_pick_tables(cur):
    # Leave the former stock_pick_records table intact as a read-only archive.
    cur.execute("""CREATE TABLE IF NOT EXISTS stock_strategy_trades (
        id BIGINT PRIMARY KEY AUTO_INCREMENT, version VARCHAR(32) NOT NULL,
        symbol VARCHAR(16) NOT NULL, name VARCHAR(64) NOT NULL, sector VARCHAR(64) NOT NULL,
        signal_day DATE NOT NULL, signal_at DATETIME NOT NULL, snapshot_json JSON NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'queued', entry_day DATE NULL, entry_at DATETIME NULL,
        entry_price DECIMAL(12,4) NULL, quantity INT NULL, entry_fee DECIMAL(12,2) NULL,
        entry_cash DECIMAL(12,2) NULL, entry_json JSON NULL,
        last_price DECIMAL(12,4) NULL, last_at DATETIME NULL, peak_price DECIMAL(12,4) NULL,
        last_json JSON NULL, exit_at DATETIME NULL, exit_price DECIMAL(12,4) NULL,
        exit_fee DECIMAL(12,2) NULL, net_pnl DECIMAL(12,2) NULL, net_return DECIMAL(10,4) NULL,
        exit_reason VARCHAR(64) NULL, note VARCHAR(255) NULL,
        UNIQUE KEY uq_signal(version,symbol,signal_day), KEY idx_status(version,status),
        KEY idx_signal(version,signal_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
    cur.execute("""CREATE TABLE IF NOT EXISTS stock_strategy_runs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT, version VARCHAR(32) NOT NULL,
        run_key VARCHAR(80) NOT NULL, phase VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL,
        started_at DATETIME NOT NULL, finished_at DATETIME NOT NULL, result_json JSON NOT NULL,
        UNIQUE KEY uq_run(version,run_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
    cur.execute("""CREATE TABLE IF NOT EXISTS stock_strategy_equity (
        id BIGINT PRIMARY KEY AUTO_INCREMENT, version VARCHAR(32) NOT NULL,
        observed_at DATETIME NOT NULL, equity DECIMAL(14,2) NOT NULL, peak DECIMAL(14,2) NOT NULL,
        drawdown_pct DECIMAL(10,4) NOT NULL, stale_positions INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_equity(version,observed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")

def utc_naive(now):
    return now.astimezone(timezone.utc).replace(tzinfo=None)

def serial(value):
    if isinstance(value, datetime):
        return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).astimezone(CN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(type(value).__name__)

def dump(value):
    return json.dumps(value, ensure_ascii=False, default=serial)

def decode(value):
    return json.loads(value) if isinstance(value, (str, bytes)) else (value or {})

def public_trade(row):
    r = json.loads(dump(row))
    for key in ("snapshot_json", "entry_json", "last_json"):
        r[key.removesuffix("_json")] = decode(r.pop(key, None))
    if r.get("entry_day"):
        try:
            end = datetime.strptime(r["exit_at"][:10], "%Y-%m-%d").date() if r.get("exit_at") else cn_now().date()
            r["held_days"] = trade_days_between(datetime.strptime(r["entry_day"], "%Y-%m-%d").date(), end)
        except ValueError:
            r["held_days"] = None
    if r.get("entry_cash") and r.get("last_price") and r["status"] in ("open", "review"):
        value = r["last_price"]*r["quantity"] - fees(r["last_price"], r["quantity"], "sell")
        r["unrealized_return"] = round((value-r["entry_cash"])/r["entry_cash"]*100,2)
    return r

def market_context(rows, now):
    valid = [r for r in rows if market_data.number(r.get("pct")) is not None and (r.get("amount") or 0)>0]
    fresh = [r for r in valid if r.get("timestamp") and abs(now.timestamp()-r["timestamp"])<=180]
    if len(valid)<2500 or len(fresh)<len(valid)*0.8:
        raise RuntimeError("市场行情缺失或过期，暂停正式信号")
    ratio = sum(r["pct"]>0 for r in valid)/len(valid)
    index = market_data.quotes(["sh000001"]).get("sh000001")
    if not market_data.fresh_quote(index,now):
        raise RuntimeError("指数实时行情未核验")
    pct = (index["last"]/index["prev_close"]-1)*100
    allowed = ratio>=0.4 and pct>-1.5
    return {"allow_recommend": allowed, "up_ratio": round(ratio*100,1), "index_pct": round(pct,2),
            "sample_count": len(valid), "quote_at": index["at"],
            "source": "、".join(sorted({r.get("source", "东方财富实时行情") for r in rows})),
            "message": "市场过滤通过" if allowed else "市场明显偏弱，本次空仓观察"}

def compute_screen(now):
    rows = market_data.spot_market()
    market = market_context(rows,now)
    sectors = {}
    for r in rows:
        if r.get("sector") and r.get("pct") is not None and (r.get("amount") or 0)>0:
            sectors.setdefault(r["sector"],[]).append(r["pct"])
    context = {s:{"mean_pct":mean(p),"up_ratio":sum(x>0 for x in p)/len(p)} for s,p in sectors.items() if len(p)>=5}
    base = {"version":VERSION,"generated_at":now.strftime("%Y-%m-%d %H:%M:%S"),"market":market,"items":[],"validation":RULES["validation"]}
    if not market["allow_recommend"]:
        return {**base,"message":market["message"],"data_ok":True}
    if len(context)<20:
        raise RuntimeError("行业行情缺失，暂停正式信号")
    allowed = {v.strip() for v in os.environ.get("ACCOUNT_ALLOWED_EXCHANGES","SH,SZ").upper().split(",")}
    restricted = set(re.findall(r"\d{6}",os.environ.get("ACCOUNT_RESTRICTED_SYMBOLS","")+","+os.environ.get("RESTRICTED_SYMBOLS","")))
    pool = [r for r in rows if market_data.normal_stock(r["symbol"],r["name"]) and r["symbol"] not in restricted
        and ("SH" if r["symbol"].startswith("6") else "SZ") in allowed
        and (r["amount"] or 0)>=1e8 and 0.3<=(r["pct"] or -999)<=4.5 and r["sector"] in context
        and context[r["sector"]]["mean_pct"]>=0 and context[r["sector"]]["up_ratio"]>=0.5]
    pool = sorted(pool,key=lambda r:r["amount"],reverse=True)[:100]
    qmap = market_data.quotes([r["symbol"] for r in pool])
    errors = []
    def evaluate(r):
        try:
            q=qmap.get(r["symbol"])
            if not market_data.fresh_quote(q,now):
                raise RuntimeError("报价缺失")
            result=evaluate_pullback(r,market_data.daily_bars(r["symbol"]),q,now,context[r["sector"]],market)
            if result:
                news=market_data.announcements(r["symbol"],(now.date()-timedelta(days=30)).isoformat())
                if news["negative"]:
                    return None
                result["announcements"]=news
            return result
        except RuntimeError:
            errors.append(r["symbol"])
            return None
    with ThreadPoolExecutor(max_workers=8) as executor:
        candidates=[r for r in executor.map(evaluate,pool) if r]
    items=sorted(candidates,key=lambda r:r["match_score"],reverse=True)[:RULES["max_positions"]]
    data_ok=not errors
    return {**base,"items":items,"data_ok":data_ok,"scan_count":len(pool),"data_error_count":len(errors),
            "message":f"筛选完成：{len(items)}只；条件不足可空仓" if data_ok else f"{len(errors)}只股票数据核验失败，本次仅供预览，不写正式信号"}

def _open_rows(cur):
    cur.execute("SELECT * FROM stock_strategy_trades WHERE version=%s AND status IN ('queued','open','review') ORDER BY id",(VERSION,))
    return cur.fetchall() or []

def _cash(cur,trades):
    cur.execute("SELECT COALESCE(SUM(net_pnl),0) AS pnl FROM stock_strategy_trades WHERE version=%s AND status='closed'",(VERSION,))
    return RULES["capital"]+float(cur.fetchone()["pnl"])-sum(float(t["entry_cash"] or 0) for t in trades if t["status"] in ("open","review"))

def _observe_equity(cur,now):
    trades=_open_rows(cur)
    cash=_cash(cur,trades)
    opened=[t for t in trades if t["status"] in ("open","review")]
    eq=cash+sum(float(t["last_price"] or t["entry_price"])*int(t["quantity"])-fees(float(t["last_price"] or t["entry_price"]),int(t["quantity"]),"sell") for t in opened)
    cur.execute("SELECT MAX(peak) AS peak FROM stock_strategy_equity WHERE version=%s",(VERSION,))
    peak=max(RULES["capital"],float(cur.fetchone()["peak"] or 0),eq)
    stale=sum(not t["last_at"] or (utc_naive(now)-t["last_at"]).total_seconds()>360 for t in opened)
    cur.execute("INSERT IGNORE INTO stock_strategy_equity(version,observed_at,equity,peak,drawdown_pct,stale_positions) VALUES(%s,%s,%s,%s,%s,%s)",
                (VERSION,utc_naive(now),money(eq),money(peak),round((eq/peak-1)*100,4),stale))

def run_job(now=None):
    now=now or cn_now()
    phase=phase_at(now)
    if phase in ("closed","idle"):
        return {"success":True,"phase":phase,"message":"非执行时段，未生成信号或成交"}
    key=now.strftime("%Y-%m-%d")+":"+(phase if phase in ("signal","preview","close","entry") else now.strftime("%H:%M"))
    with db() as cur:
        cur.execute("SELECT status,result_json FROM stock_strategy_runs WHERE version=%s AND run_key=%s",(VERSION,key))
        existing=cur.fetchone()
        if existing and existing["status"]=="ok":
            return {**decode(existing["result_json"]),"reused":True}
        initial=_open_rows(cur)
    result={"success":True,"phase":phase,"signals_saved":0,"entered":0,"exited":0}
    screen=None
    errors=[]
    if phase in ("signal","preview"):
        try:
            screen=compute_screen(now)
            if not screen["data_ok"]:
                errors.append(screen["message"])
        except RuntimeError as exc:
            errors.append(str(exc))
    qmap={}
    bars_map={}
    if initial:
        try:
            qmap=market_data.quotes([t["symbol"] for t in initial])
            for t in initial:
                if t["status"] in ("open","review"):
                    try:
                        bars_map[t["symbol"]]=market_data.daily_bars(t["symbol"],70)
                    except RuntimeError:
                        errors.append(f"{t['symbol']}日K核验失败")
        except RuntimeError as exc:
            errors.append(str(exc))
    finished=cn_now()
    # Network work precedes the write lock. Re-read after obtaining the lock.
    with db(write=True) as cur:
        cur.execute("SELECT status,result_json FROM stock_strategy_runs WHERE version=%s AND run_key=%s",(VERSION,key))
        existing=cur.fetchone()
        if existing and existing["status"]=="ok":
            return {**decode(existing["result_json"]),"reused":True}
        trades=_open_rows(cur)
        for t in trades:
            q=qmap.get(t["symbol"])
            if t["status"]=="queued":
                if str(t["signal_day"])!=now.date().isoformat() or now.hour*60+now.minute>=897 or finished.hour*60+finished.minute>=897:
                    cur.execute("UPDATE stock_strategy_trades SET status='expired',note='未在当日14:55~14:56获得可成交报价' WHERE id=%s AND status='queued'",(t["id"],))
                    continue
                if phase!="entry":
                    continue
                signal=decode(t["snapshot_json"])
                if not market_data.fresh_quote(q,finished) or datetime.fromisoformat(q["at"]).astimezone(timezone.utc).replace(tzinfo=None)<=t["signal_at"]:
                    errors.append(f"{t['symbol']}没有更新的买入报价")
                    continue
                if abs(q["last"]/signal["quote"]["last"]-1)>0.02:
                    cur.execute("UPDATE stock_strategy_trades SET status='expired',note='价格较信号偏离超过2%，放弃追单' WHERE id=%s",(t["id"],))
                    continue
                if sum(x["status"] in ("open","review") for x in trades)>=RULES["max_positions"] or any(x["symbol"]==t["symbol"] and x["status"] in ("open","review") for x in trades):
                    cur.execute("UPDATE stock_strategy_trades SET status='expired',note='持仓已满或已持有同股' WHERE id=%s",(t["id"],))
                    continue
                order=entry_order(q,min(RULES["position_budget"],_cash(cur,trades)))
                if not order:
                    errors.append(f"{t['symbol']}卖盘不足或模拟资金不足")
                    continue
                at=utc_naive(datetime.fromisoformat(q["at"]))
                cur.execute("""UPDATE stock_strategy_trades SET status='open',entry_day=%s,entry_at=%s,
                    entry_price=%s,quantity=%s,entry_fee=%s,entry_cash=%s,entry_json=%s,
                    last_price=%s,last_at=%s,peak_price=%s,last_json=%s,note=NULL WHERE id=%s AND status='queued'""",
                    (now.date(),at,order["entry_price"],order["quantity"],order["entry_fee"],order["entry_cash"],dump(q),q["last"],at,q["last"],dump(q),t["id"]))
                t.update(order,status="open")
                result["entered"]+=1
                continue
            if not q or not market_data.fresh_quote(q,finished,120 if phase!="close" else 1200):
                errors.append(f"{t['symbol']}报价缺失或过期")
                continue
            bars=[b for b in bars_map.get(t["symbol"],[]) if b["date"]<now.date().isoformat()]
            if not bars:
                continue
            if abs(q["prev_close"]-bars[-1]["close"])>0.021 or t["status"]=="review":
                cur.execute("UPDATE stock_strategy_trades SET status='review',note='发生除权除息或价格基础不一致，收益待复核' WHERE id=%s",(t["id"],))
                errors.append(f"{t['symbol']}收益待复核")
                continue
            at=utc_naive(datetime.fromisoformat(q["at"]))
            if t["last_at"] and at<=t["last_at"]:
                continue
            reason=exit_reason(t,q,finished,ma20=mean(b["close"] for b in bars[-20:])) if phase!="close" and phase_at(finished) not in ("idle","closed","close") else None
            accounting=close_accounting(t,q) if reason else None
            if accounting:
                cur.execute("""UPDATE stock_strategy_trades SET status='closed',exit_at=%s,exit_price=%s,exit_fee=%s,
                    net_pnl=%s,net_return=%s,exit_reason=%s,last_price=%s,last_at=%s,last_json=%s,note=NULL WHERE id=%s AND status='open'""",
                    (at,accounting["exit_price"],accounting["exit_fee"],accounting["net_pnl"],accounting["net_return"],reason,q["last"],at,dump(q),t["id"]))
                result["exited"]+=cur.rowcount
                if cur.rowcount:
                    t.update(accounting,status="closed")
            else:
                cur.execute("UPDATE stock_strategy_trades SET last_price=%s,last_at=%s,peak_price=%s,last_json=%s,note=%s WHERE id=%s AND status='open'",
                    (q["last"],at,max(float(t["peak_price"]),q["last"]),dump(q),"触发退出但买盘不足，继续持有" if reason else None,t["id"]))
                if reason:
                    errors.append(f"{t['symbol']}退出受阻，继续跟踪")
        if screen and phase=="signal" and screen["data_ok"] and phase_at(finished)=="signal":
            for item in screen["items"]:
                cur.execute("INSERT IGNORE INTO stock_strategy_trades(version,symbol,name,sector,signal_day,signal_at,snapshot_json) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                    (VERSION,item["symbol"],item["name"],item["sector"],now.date(),utc_naive(now),dump({**item,"rules":RULES})))
                result["signals_saved"]+=cur.rowcount
        elif screen and phase=="signal" and phase_at(finished)!="signal":
            errors.append("筛选完成时已超出14:50~14:54，未补写过时信号")
        if phase not in ("preview","signal"):
            _observe_equity(cur,finished)
        result.update(screen=screen,errors=list(dict.fromkeys(errors)),success=not errors,
                      generated_at=finished.strftime("%Y-%m-%d %H:%M:%S"),message="检查完成" if not errors else "数据或成交存在待核验项")
        cur.execute("""INSERT INTO stock_strategy_runs(version,run_key,phase,status,started_at,finished_at,result_json)
            VALUES(%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE status=VALUES(status),finished_at=VALUES(finished_at),result_json=VALUES(result_json)""",
            (VERSION,key,phase,"ok" if not errors else "partial",utc_naive(now),utc_naive(finished),dump(result)))
    return result

def stats(cur):
    cur.execute("""SELECT COUNT(*) AS total,SUM(status='open') AS open_count,SUM(status='queued') AS queued,
        SUM(status='review') AS review_count,SUM(status='closed') AS settled,
        SUM(status='closed' AND net_pnl>0) AS wins,AVG(CASE WHEN status='closed' THEN net_return END) AS avg_return,
        SUM(CASE WHEN status='closed' THEN net_pnl ELSE 0 END) AS net_pnl,
        AVG(CASE WHEN status='closed' AND net_pnl>0 THEN net_pnl END) AS avg_win,
        AVG(CASE WHEN status='closed' AND net_pnl<0 THEN net_pnl END) AS avg_loss
        FROM stock_strategy_trades WHERE version=%s""",(VERSION,))
    s=json.loads(dump(cur.fetchone()))
    s["settled"]=int(s["settled"] or 0)
    s["win_rate"]=round(float(s["wins"] or 0)/s["settled"]*100,1) if s["settled"] else None
    s["payoff_ratio"]=round(float(s["avg_win"])/abs(float(s["avg_loss"])),2) if s["avg_win"] and s["avg_loss"] else None
    cur.execute("SELECT MIN(drawdown_pct) AS max_drawdown FROM stock_strategy_equity WHERE version=%s",(VERSION,))
    s["max_drawdown"]=market_data.number(cur.fetchone()["max_drawdown"])
    cur.execute("SELECT * FROM stock_strategy_equity WHERE version=%s ORDER BY id DESC LIMIT 1",(VERSION,))
    equity=cur.fetchone()
    s["equity"]=json.loads(dump(equity)) if equity else None
    return s

def dashboard():
    with db() as cur:
        cur.execute("SELECT * FROM stock_strategy_runs WHERE version=%s ORDER BY finished_at DESC LIMIT 1",(VERSION,))
        latest=cur.fetchone()
        cur.execute("SELECT finished_at FROM stock_strategy_runs WHERE version=%s AND status='ok' ORDER BY finished_at DESC LIMIT 1",(VERSION,))
        successful=cur.fetchone()
        cur.execute("SELECT result_json FROM stock_strategy_runs WHERE version=%s AND phase IN ('signal','preview') ORDER BY finished_at DESC LIMIT 1",(VERSION,))
        screened=cur.fetchone()
        summary=stats(cur)
    now=cn_now()
    try:
        phase=phase_at(now)
        calendar_ok=True
    except ValueError:
        phase="calendar_unverified"
        calendar_ok=False
    return {"success":True,"rules":RULES,"calendar_source":CALENDAR_SOURCE,"calendar_ok":calendar_ok,
        "phase":phase,"generated_at":now.strftime("%Y-%m-%d %H:%M:%S"),"stats":summary,
        "latest_screen":decode(screened["result_json"]).get("screen") if screened else None,
        "last_success_at":serial(successful["finished_at"]) if successful else None,
        "last_run":{**json.loads(dump(latest)),"result":decode(latest["result_json"])} if latest else None}

@router.get("/status")
def status(_admin=Depends(_admin_user)):
    return dashboard()

@router.get("/recommend-pullback")
def recommend(_admin=Depends(_admin_user)):
    now=cn_now()
    if phase_at(now) in ("closed","idle","close"):
        return {"success":True,"preview":True,"items":[],"message":"当前非盘中筛选时段；查看最近自动运行结果即可，预览不会记作成交"}
    if not _preview_lock.acquire(blocking=False):
        raise HTTPException(409,"筛选正在进行，请稍后刷新")
    try:
        if _preview_cache.get("expires",0)>now.timestamp():
            return _preview_cache["data"]
        result={**compute_screen(now),"preview":True,"success":True}
        _preview_cache.update(data=result,expires=now.timestamp()+60)
        return result
    except RuntimeError as exc:
        raise HTTPException(503,str(exc)) from exc
    finally:
        _preview_lock.release()

@router.post("/run")
def run(_admin=Depends(_admin_user)):
    try:
        return run_job()
    except (RuntimeError,ValueError) as exc:
        raise HTTPException(503,str(exc)) from exc

@router.get("/records")
def records(limit:int=Query(20,ge=1,le=20),offset:int=Query(0,ge=0),state:str=Query(""),_admin=Depends(_admin_user)):
    if state not in ("","queued","open","closed","review","expired"):
        raise HTTPException(400,"记录状态无效")
    where="version=%s"+(" AND status=%s" if state else "")
    args=(VERSION,state) if state else (VERSION,)
    with db() as cur:
        cur.execute("SELECT COUNT(*) AS total FROM stock_strategy_trades WHERE "+where,args)
        total=cur.fetchone()["total"]
        cur.execute("SELECT * FROM stock_strategy_trades WHERE "+where+" ORDER BY id DESC LIMIT %s OFFSET %s",(*args,limit,offset))
        items=[public_trade(r) for r in cur.fetchall() or []]
    return {"success":True,"items":items,"total":total,"limit":limit,"offset":offset}

@router.get("/legacy-records")
def legacy_records(limit:int=Query(20,ge=1,le=20),offset:int=Query(0,ge=0),_admin=Depends(_admin_user)):
    with db() as cur:
        cur.execute("SHOW TABLES LIKE 'stock_pick_records'")
        if not cur.fetchone():
            return {"success":True,"items":[],"total":0}
        cur.execute("SELECT COUNT(*) AS total FROM stock_pick_records")
        total=cur.fetchone()["total"]
        cur.execute("SELECT id,strategy,symbol,name,buy_date,sell_date,buy_price,sell_price,pct_return,status,in_live_window FROM stock_pick_records ORDER BY id DESC LIMIT %s OFFSET %s",(limit,offset))
        items=json.loads(dump(cur.fetchall() or []))
    return {"success":True,"items":items,"total":total,"message":"旧策略归档：参考价、费用和预览口径不同，不纳入新策略统计"}

def review_export(days=90):
    result=dashboard()
    since=cn_now().date()-timedelta(days=days)
    with db() as cur:
        cur.execute("SELECT * FROM stock_strategy_trades WHERE version=%s AND (signal_day>=%s OR status IN ('open','review','queued')) ORDER BY id DESC LIMIT 501",(VERSION,since))
        rows=cur.fetchall() or []
        result["trades"]=[public_trade(r) for r in rows[:500]]
        result["truncated"]=len(rows)>500
        cur.execute("SELECT phase,status,finished_at,result_json FROM stock_strategy_runs WHERE version=%s AND finished_at>=%s ORDER BY id DESC LIMIT 100",(VERSION,utc_naive(cn_now()-timedelta(days=7))))
        result["recent_runs"]=[{**json.loads(dump(r)),"result":decode(r["result_json"])} for r in cur.fetchall() or []]
    return {**result,"window_days":days,"source":"网站数据库，只读导出","accounting":"模拟成交；买卖盘参考价加滑点，扣费后统计；旧策略不混入","sample_note":"未完成历史回测；当前为前向模拟记录"}

@router.get("/review-export")
def export(days:int=Query(90,ge=7,le=365),_admin=Depends(_admin_user)):
    return review_export(days)
