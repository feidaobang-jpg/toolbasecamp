"""Versioned pullback rules and conservative paper-execution accounting."""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from statistics import mean
from stock_calendar import CN_TZ, trade_days_between
from stock_market import fresh_quote

VERSION = "pullback-v1"
RULES = {
    "version": VERSION, "name": "回调企稳", "mode": "模拟跟踪", "capital": 30000.0,
    "position_budget": 10000.0, "max_positions": 3, "hold_days": [3, 10],
    "stop_loss_pct": -4.0, "take_profit_pct": 8.0, "trailing_start_pct": 5.0,
    "trailing_drawdown_pct": 3.0, "commission_rate": 0.0003, "minimum_commission": 5.0,
    "stamp_tax_rate": 0.0005, "transfer_fee_rate": 0.00001, "slippage_rate": 0.001,
    "signal_time": "14:50", "entry_time": "14:55", "watch_interval_minutes": 5,
    "calendar_verified_through": "2026-12-31",
    "validation": "初始规则，尚未完成历史回测和样本外验证；不代表已证实高胜率",
}

def money(value):
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def fees(price, quantity, side, rules=RULES):
    value = price * quantity
    return money(max(rules["minimum_commission"], value * rules["commission_rate"]) + value * rules["transfer_fee_rate"] + (value * rules["stamp_tax_rate"] if side == "sell" else 0))

def execution_price(q, quantity, side, rules=RULES):
    price = q.get("ask" if side == "buy" else "bid") or 0
    size = q.get("ask_size" if side == "buy" else "bid_size") or 0
    if price <= 0 or size < quantity:
        return None
    return money(price * (1 + rules["slippage_rate"] * (1 if side == "buy" else -1)))

def entry_order(q, budget, rules=RULES):
    px = execution_price(q, 100, "buy", rules)
    if not px:
        return None
    qty = int(budget / px / 100) * 100
    while qty >= 100 and px * qty + fees(px, qty, "buy", rules) > budget:
        qty -= 100
    if qty < 100 or execution_price(q, qty, "buy", rules) is None:
        return None
    return {"entry_price": px, "quantity": qty, "entry_fee": fees(px, qty, "buy", rules),
            "entry_cash": money(px * qty + fees(px, qty, "buy", rules))}

def evaluate_pullback(row, bars, q, now, sector, market):
    if not fresh_quote(q, now) or not market["allow_recommend"] or not sector:
        return None
    history = [b for b in bars if b["date"] < now.astimezone(CN_TZ).date().isoformat()]
    if len(history) < 70:
        return None
    closes, volumes = [b["close"] for b in history], [b["volume"] for b in history]
    if min(closes[-70:]) <= 0 or min(volumes[-10:]) <= 0:
        return None
    last = q["last"]
    ma20, old_ma20, ma60, old_ma60 = mean(closes[-20:]), mean(closes[-25:-5]), mean(closes[-60:]), mean(closes[-65:-5])
    pct = (last / q["prev_close"] - 1) * 100
    if not (ma20 > ma60 and ma20 > old_ma20 and ma60 >= old_ma60 and ma20 <= last <= ma20 * 1.08):
        return None
    if not 0.3 <= pct <= 4.5 or (row.get("amount") or 0) < 1e8:
        return None
    if abs(q["prev_close"] - closes[-1]) > 0.021:
        return None
    peak_index = max(range(len(closes)-7, len(closes)-2), key=lambda i: closes[i])
    pullback_days = len(closes)-1-peak_index
    depth = (1 - closes[-1] / closes[peak_index]) * 100
    if not 2 <= pullback_days <= 5 or not 2 <= depth <= 8:
        return None
    pull_vol, base_vol = mean(volumes[peak_index+1:]), mean(volumes[peak_index-4:peak_index+1])
    if pull_vol > base_vol * 0.85 or min(closes[peak_index+1:]) < ma20 * 0.98:
        return None
    if last < history[-1]["high"] or q["low"] < history[-1]["low"] * 0.99:
        return None
    minute = now.hour*60+now.minute
    elapsed = max(1, min(240, (minute-570 if minute <= 690 else 120+minute-780)))
    vr = (q["volume"] or 0) * 240 / elapsed / mean(volumes[-5:])
    if not 1.0 <= vr <= 3.0 or sector["mean_pct"] < 0 or sector["up_ratio"] < 0.5:
        return None
    score = round(min(100, 55 + min(10, depth*2) + min(10, (1-pull_vol/base_vol)*20) + min(15, sector["up_ratio"]*15) + min(10, (ma20/old_ma20-1)*200)), 1)
    return {"symbol": row["symbol"], "name": row["name"], "sector": row["sector"], "match_score": score,
        "quote": q, "metrics": {"last_price": last, "pct_change": round(pct,2), "ma20": round(ma20,3),
            "ma60": round(ma60,3), "pullback_days": pullback_days, "pullback_pct": round(depth,2),
            "pullback_volume_ratio": round(pull_vol/base_vol,2), "volume_ratio": round(vr,2),
            "sector_pct": round(sector["mean_pct"],2), "sector_up_ratio": round(sector["up_ratio"]*100,1)},
        "reason": f"20/60日趋势向上；回调{pullback_days}日约{depth:.1f}%，缩量后重新站上昨日高点；行业上涨家数占比{sector['up_ratio']:.0%}"}

def exit_reason(trade, q, now, rules=RULES, ma20=None):
    entry_day = trade["entry_day"]
    if isinstance(entry_day, str):
        entry_day = datetime.strptime(entry_day, "%Y-%m-%d").date()
    if now.astimezone(CN_TZ).date() <= entry_day:
        return None
    gross = (q["last"] / float(trade["entry_price"]) - 1)*100
    peak = max(float(trade["peak_price"]), q["last"])
    if gross <= rules["stop_loss_pct"]:
        return "止损"
    if gross >= rules["take_profit_pct"]:
        return "止盈"
    if (peak/float(trade["entry_price"])-1)*100 >= rules["trailing_start_pct"] and q["last"] <= peak*(1-rules["trailing_drawdown_pct"]/100):
        return "回撤止盈"
    held = trade_days_between(entry_day, now.astimezone(CN_TZ).date())
    at_tail = now.hour == 14 and 55 <= now.minute < 57
    if at_tail and held >= rules["hold_days"][0] and ma20 and q["last"] < ma20:
        return "趋势破坏"
    if at_tail and held >= rules["hold_days"][1]:
        return "持仓到期"
    return None

def close_accounting(trade, q, rules=RULES):
    px = execution_price(q, int(trade["quantity"]), "sell", rules)
    if px is None:
        return None
    fee = fees(px, int(trade["quantity"]), "sell", rules)
    pnl = money(px*int(trade["quantity"]) - fee - float(trade["entry_cash"]))
    return {"exit_price": px, "exit_fee": fee, "net_pnl": pnl,
            "net_return": round(pnl/float(trade["entry_cash"])*100,4)}
