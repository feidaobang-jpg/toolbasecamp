"""Versioned strategy rules and conservative paper-execution accounting."""
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

ETF_VERSION = "etf-dip-v1"
# Exchange-traded QDII funds on developed-market broad indexes; one index family buys at most one fund a day.
ETF_FAMILIES = {
    "纳斯达克100": ["513100", "159941", "513300", "159632", "159501", "159659", "513110", "159513", "159696", "159660", "513390", "513870"],
    "标普500": ["513500", "159612", "513650", "159655"],
    "日经225": ["513520", "513880", "159866", "513000"],
    "德国DAX": ["513030"],
    "法国CAC40": ["513080"],
    "道琼斯": ["513400"],
}
ETF_RULES = {
    "version": ETF_VERSION, "name": "指数ETF急跌低吸", "mode": "模拟跟踪", "instrument": "etf",
    "subtitle": "发达市场指数ETF · 短线急跌 · 反弹即走", "badge": "短线 · 模拟跟踪",
    "capital": 30000.0, "position_budget": 10000.0, "max_positions": 3, "allow_scale_in": True,
    "rsi_period": 2, "rsi_entry": 5.0, "min_amount_20d": 5e7,
    "max_premium_pct": 3.0, "premium_sessions": 5, "premium_lag_sessions": 2,
    "take_profit_pct": 2.0, "exit_ma_days": 5, "max_hold_days": 10,
    "commission_rate": 0.0003, "minimum_commission": 5.0, "stamp_tax_rate": 0.0,
    "transfer_fee_rate": 0.0, "slippage_rate": 0.001, "basis_tolerance": 0.0021, "price_digits": 4,
    "signal_time": "14:50", "entry_time": "14:55", "watch_interval_minutes": 5,
    "calendar_verified_through": "2026-12-31", "families": ETF_FAMILIES,
    "summary": [
        "标的：纳斯达克100、标普500、日经225、德国DAX、法国CAC40、道琼斯六个指数的场内ETF，共23只；近20日日均成交额至少5000万元。不买个股。",
        "买入：14:50按当时价格计算2日RSI，低于5（通常是连续两天明显下跌）才算信号；每个指数只选溢价最低的一只，按RSI从低到高最多3只，14:55模拟买入。后续交易日再次触发可以继续加仓，总共最多3仓。",
        "溢价保护：用已披露净值的最近5个交易日计算平均收盘溢价，高于3%不买；净值核验不到也不买。场内价格高出净值太多时，溢价回落会直接造成亏损。",
        "卖出：买入后下一交易日起，任一次检查发现盈利达到2%即卖出；否则每天14:55若价格重新站上5日均线就卖出；最迟第10个交易日14:55卖出。不设止损，单笔亏损靠仓位和时间上限控制。",
    ],
    "backtest": {
        "period": "2017-07 ～ 2026-10（首笔2018-09）", "trades": 159, "win_rate": 72.3,
        "avg_net_return": 0.56, "median_net_return": 0.82, "profit_factor": 2.33,
        "avg_win": 1.36, "avg_loss": -1.52, "worst_trade": -7.7, "max_losing_streak": 5,
        "avg_hold_days": 3.2, "account_total_return": 29.8, "account_annualized": 2.9,
        "realized_drawdown": -4.4, "first_half_win_rate": 60.0, "second_half_win_rate": 77.2,
        "weak_years": "2018年4笔胜率25%，2019年12笔胜率50%",
        "stress": "信号次日开盘才买：胜率69.8%、单笔+0.33%；滑点加倍：胜率67.9%、单笔+0.36%",
        "note": "日线回测，以收盘价近似14:55成交，费用口径与模拟一致；胜率高但出手少、资金大部分时间空闲。历史不代表未来。",
    },
    "validation": "历史日线回测159笔，扣费胜率72.3%、单笔平均净收益0.56%；分段胜率60%～77%。回测不代表未来，前向模拟样本不足30笔前不能判断稳定性",
}

# Registration order is execution order: the primary strategy screens first inside the 14:50 window.
STRATEGY_RULES = {ETF_VERSION: ETF_RULES, VERSION: RULES}
DEFAULT_VERSION = ETF_VERSION

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
    # Funds quote in tenths of a cent: rounding their fills to cents would move the price by 0.3%.
    digits = Decimal(1).scaleb(-rules.get("price_digits", 2))
    return float(Decimal(str(price * (1 + rules["slippage_rate"] * (1 if side == "buy" else -1)))).quantize(digits, rounding=ROUND_HALF_UP))

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

def rsi(closes, period=2):
    """Wilder RSI; with a short period the zero seed fades within a few bars."""
    up = down = 0.0
    for prev, cur in zip(closes, closes[1:]):
        change = cur - prev
        up = (up * (period - 1) + max(change, 0.0)) / period
        down = (down * (period - 1) + max(-change, 0.0)) / period
    if down == 0:
        return 100.0 if up > 0 else 50.0
    return 100 - 100 / (1 + up / down)

def etf_dip_setup(bars, q, now, rules=ETF_RULES):
    """Price-only part of the signal; None when it is not met."""
    state = etf_dip_state(bars, q, now, rules)
    return state if state and state.pop("triggered") else None

def etf_dip_state(bars, q, now, rules=ETF_RULES):
    """Bars before today plus the live quote; None when the quote or the price basis cannot be trusted."""
    if not fresh_quote(q, now):
        return None
    history = [b for b in bars if b["date"] < now.astimezone(CN_TZ).date().isoformat()]
    if len(history) < 30:
        return None
    closes = [b["close"] for b in history[-30:]]
    # A split or payout inside the window breaks the price basis: skip rather than guess a factor.
    if min(closes) <= 0 or any(abs(b / a - 1) > 0.11 for a, b in zip(closes, closes[1:])):
        return None
    if abs(q["prev_close"] - closes[-1]) > rules["basis_tolerance"]:
        return None
    amount = mean(b.get("amount") or b["volume"] * b["close"] for b in history[-20:])
    value = rsi(closes + [q["last"]], rules["rsi_period"])
    return {"triggered": amount >= rules["min_amount_20d"] and value < rules["rsi_entry"],
            "history": history, "rsi": round(value, 2), "amount_20d": round(amount),
            "pct_change": round((q["last"] / q["prev_close"] - 1) * 100, 2),
            "two_day_pct": round((q["last"] / closes[-2] - 1) * 100, 2)}

def premium_level(history, navs, rules=ETF_RULES):
    """Mean close-over-NAV premium (%) on the sessions whose NAV is already published.

    Overseas NAVs arrive one to two sessions late, so the window ends `premium_lag_sessions` back.
    A session without its own NAV (overseas holiday) reuses the latest matched one within three
    sessions. None when any session of the window stays unknown: an unverified premium never buys."""
    lag, count = rules["premium_lag_sessions"], rules["premium_sessions"]
    end = len(history) - lag + 1
    if end - count < 0:
        return None
    values = []
    for index in range(end - count, end):
        for back in range(4):
            bar = history[index - back] if index - back >= 0 else None
            nav = navs.get(bar["date"]) if bar else None
            if nav:
                values.append(bar["close"] / nav - 1)
                break
    return round(mean(values) * 100, 2) if len(values) == count else None

def etf_exit_reason(trade, q, now, rules=ETF_RULES, closes=None):
    """Profit target at any check; otherwise leave at the tail on a rebound or at the time limit."""
    entry_day = trade["entry_day"]
    if isinstance(entry_day, str):
        entry_day = datetime.strptime(entry_day, "%Y-%m-%d").date()
    local = now.astimezone(CN_TZ)
    if local.date() <= entry_day:
        return None
    if (q["last"] / float(trade["entry_price"]) - 1) * 100 >= rules["take_profit_pct"]:
        return "止盈"
    if not (local.hour == 14 and 55 <= local.minute < 57):
        return None
    days = rules["exit_ma_days"]
    if closes and len(closes) >= days - 1 and q["last"] > mean(list(closes[-(days - 1):]) + [q["last"]]):
        return "反弹离场"
    if trade_days_between(entry_day, local.date()) >= rules["max_hold_days"]:
        return "持仓到期"
    return None
