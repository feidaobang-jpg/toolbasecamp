"""Exchange trading days; an unverified year never silently becomes weekdays."""
from datetime import date, datetime, timedelta, timezone

CN_TZ = timezone(timedelta(hours=8))
CALENDAR_SOURCE = "https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml"
HOLIDAY_RANGES = {
    2026: [("01-01", "01-03"), ("02-15", "02-23"), ("04-04", "04-06"),
           ("05-01", "05-05"), ("06-19", "06-21"), ("09-25", "09-27"), ("10-01", "10-07")],
}


def cn_now():
    return datetime.now(timezone.utc).astimezone(CN_TZ)


def is_trade_day(day: date) -> bool:
    if day.year not in HOLIDAY_RANGES:
        raise ValueError(f"{day.year}年交易日历尚未核验，暂停自动交易模拟")
    md = day.strftime("%m-%d")
    return day.weekday() < 5 and not any(start <= md <= end for start, end in HOLIDAY_RANGES[day.year])


def trade_days_between(start: date, end: date) -> int:
    count = 0
    while start < end:
        start += timedelta(days=1)
        count += int(is_trade_day(start))
    return count


def phase_at(now: datetime) -> str:
    now = now.astimezone(CN_TZ)
    if not is_trade_day(now.date()):
        return "closed"
    minute = now.hour * 60 + now.minute
    if 14 * 60 + 50 <= minute < 14 * 60 + 55:
        return "signal"
    if 14 * 60 + 55 <= minute < 14 * 60 + 57:
        return "entry"
    if minute == 14 * 60 + 40:
        return "preview"
    if 15 * 60 + 10 <= minute < 15 * 60 + 15:
        return "close"
    if 9 * 60 + 35 <= minute <= 11 * 60 + 30 or 13 * 60 <= minute < 14 * 60 + 57:
        return "watch"
    return "idle"


def _next_session(day: date) -> str:
    candidate = day + timedelta(days=1)
    try:
        while not is_trade_day(candidate):
            candidate += timedelta(days=1)
    except ValueError:
        return f"{candidate.year}年交易日历尚未核验，下个交易日待确认。"
    weekday = "一二三四五六日"[candidate.weekday()]
    return f"下个交易日为{candidate:%Y-%m-%d}（周{weekday}），09:35恢复筛选预览。"


def session_message(now: datetime) -> str:
    """Explain market breaks separately from this strategy's preview window."""
    now = now.astimezone(CN_TZ)
    phase = phase_at(now)
    if phase == "closed":
        reason = ("周" + "一二三四五六日"[now.weekday()]) if now.weekday() >= 5 else "节假日"
        text = f"今日{reason}休市；" + _next_session(now.date())
    elif phase in ("idle", "close"):
        minute = now.hour * 60 + now.minute
        if minute < 9 * 60 + 30:
            text = "今日尚未开盘；09:30开盘，筛选预览于09:35开始。"
        elif minute < 9 * 60 + 35:
            text = "市场已开盘，尚未到本策略筛选时段；09:35开始筛选预览。"
        elif minute < 13 * 60:
            text = "当前为午间休市；13:00恢复筛选预览。"
        elif minute < 15 * 60:
            text = "当前为收盘集合竞价时段，本策略已结束今日筛选；" + _next_session(now.date())
        else:
            text = "今日已收盘；" + _next_session(now.date())
    else:
        return "当前为交易日盘中，可进行筛选预览；预览不会记作成交。"
    return text + "可查看最近自动运行结果；预览不会记作成交。"
