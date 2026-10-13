"""Trading invariants with a real SQLite transaction store and mocked market feeds."""
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import stocks
import stock_market
from stock_calendar import CN_TZ, is_trade_day, phase_at, session_message, trade_days_between
from stock_strategy import (ETF_RULES, RULES, STRATEGY_RULES, close_accounting, entry_order, etf_dip_setup,
    etf_exit_reason, evaluate_pullback, execution_price, exit_reason, fees, premium_level, rsi)

ETF = "etf-dip-v1"

sqlite3.register_converter("DATETIME",lambda b:datetime.fromisoformat(b.decode()))
sqlite3.register_converter("DATE",lambda b:date.fromisoformat(b.decode()))
sqlite3.register_adapter(date,lambda d:d.isoformat())
sqlite3.register_adapter(datetime,lambda d:d.isoformat(" "))

def at(day="2026-10-08",time="14:50:00"):
    return datetime.fromisoformat(day+"T"+time).replace(tzinfo=CN_TZ)

def quote(now,last=10):
    return {"symbol":"000001","name":"样本股票","at":now.isoformat(),"last":last,
        "prev_close":10,"open":10,"low":9.9,"high":10.1,"volume":1000000,
        "bid":last-0.01,"bid_size":100000,"ask":last+0.01,"ask_size":100000}

def trade_days(count,end="2026-10-08"):
    days=[]; day=date.fromisoformat(end)
    while len(days)<count:
        day-=timedelta(days=1)
        if is_trade_day(day): days.append(day.isoformat())
    return days[::-1]

def etf_bars(closes,amount=8e7,end="2026-10-08"):
    return [{"date":d,"open":c,"close":c,"high":c,"low":c,"volume":amount/c,"amount":amount}
            for d,c in zip(trade_days(len(closes),end),closes)]

def etf_quote(now,last,prev=0.98,symbol="513030",name="德国ETF"):
    return {"symbol":symbol,"name":name,"at":now.isoformat(),"last":last,"prev_close":prev,"open":prev,
        "low":last,"high":prev,"volume":5e7,"bid":round(last-0.001,3),"bid_size":900000,
        "ask":round(last+0.001,3),"ask_size":900000}

def screen(now):
    return {"version":"pullback-v1","generated_at":now.strftime("%Y-%m-%d %H:%M:%S"),
        "data_ok":True,"message":"测试行情","market":{"allow_recommend":True},
        "items":[{"symbol":"000001","name":"样本股票","sector":"样本行业","quote":quote(now),
                  "match_score":80,"metrics":{},"reason":"测试信号"}]}

class Cursor:
    def __init__(self,conn):
        self.conn=conn
        self.c=conn.cursor()
        self.custom=None
    def __enter__(self): return self
    def __exit__(self,*args): self.c.close()
    @property
    def rowcount(self): return self.c.rowcount
    def execute(self,sql,args=()):
        self.custom=None
        if "GET_LOCK" in sql:
            self.custom=[{"acquired":1}]; return
        if "RELEASE_LOCK" in sql:
            self.custom=[{"released":1}]; return
        sql=sql.replace("BIGINT PRIMARY KEY AUTO_INCREMENT","INTEGER PRIMARY KEY AUTOINCREMENT")
        sql=re.sub(r"UNIQUE KEY \w+\(([^)]+)\)",r"UNIQUE (\1)",sql)
        sql=re.sub(r",\s*KEY \w+\([^)]+\)","",sql)
        sql=sql.replace(" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4","")
        sql=sql.replace("INSERT IGNORE","INSERT OR IGNORE").replace("%s","?")
        if "ON DUPLICATE KEY UPDATE" in sql:
            sql=sql.replace("ON DUPLICATE KEY UPDATE","ON CONFLICT(version,run_key) DO UPDATE SET")
            sql=re.sub(r"VALUES\((\w+)\)",r"excluded.\1",sql)
        self.c.execute(sql,args)
    def fetchone(self):
        if self.custom is not None: return self.custom.pop(0) if self.custom else None
        row=self.c.fetchone()
        return dict(row) if row else None
    def fetchall(self): return [dict(r) for r in self.c.fetchall()]

class Connection:
    def __init__(self,path):
        self.c=sqlite3.connect(path,isolation_level=None,detect_types=sqlite3.PARSE_DECLTYPES)
        self.c.row_factory=sqlite3.Row
    def cursor(self): return Cursor(self.c)
    def begin(self): self.c.execute("BEGIN")
    def commit(self): self.c.commit()
    def rollback(self): self.c.rollback()
    def close(self): self.c.close()

class RulesTests(unittest.TestCase):
    def test_holiday_and_working_weekend(self):
        self.assertFalse(is_trade_day(date(2026,10,7)))
        self.assertTrue(is_trade_day(date(2026,10,8)))
        self.assertFalse(is_trade_day(date(2026,10,10)))
        self.assertEqual(trade_days_between(date(2026,9,30),date(2026,10,9)),2)
    def test_unverified_calendar_fails_closed(self):
        with self.assertRaises(ValueError): is_trade_day(date(2027,1,4))
    def test_windows_and_auction(self):
        self.assertEqual(phase_at(at(time="14:50:00")),"signal")
        self.assertEqual(phase_at(at(time="14:55:00")),"entry")
        self.assertEqual(phase_at(at(time="14:57:00")),"idle")
        self.assertEqual(phase_at(at(time="15:10:00")),"close")
        self.assertEqual(phase_at(at(time="12:00:00")),"idle")
    def test_session_message_weekend_and_holiday(self):
        weekend=session_message(at("2026-10-10"))
        self.assertIn("今日周六休市",weekend)
        self.assertIn("2026-10-12（周一），09:35",weekend)
        holiday=session_message(at("2026-10-01"))
        self.assertIn("今日节假日休市",holiday)
        self.assertIn("2026-10-08（周四）",holiday)
    def test_session_message_time_boundaries(self):
        for time,reason in [("09:29:59","尚未开盘"),("09:30:00","市场已开盘"),
                            ("09:34:59","09:35开始"),("09:35:00","交易日盘中"),
                            ("11:30:59","交易日盘中"),("11:31:00","午间休市"),
                            ("12:59:59","13:00恢复"),("13:00:00","交易日盘中"),
                            ("14:56:59","交易日盘中"),("14:57:00","收盘集合竞价"),
                            ("15:00:00","今日已收盘"),("15:10:00","今日已收盘")]:
            with self.subTest(time=time):
                self.assertIn(reason,session_message(at(time=time)))
    def test_session_message_uses_beijing_time_and_unverified_next_year(self):
        self.assertIn("今日周六休市",session_message(at("2026-10-10").astimezone(stocks.timezone.utc)))
        self.assertIn("2027年交易日历尚未核验，下个交易日待确认",session_message(at("2026-12-31","15:00:00")))
        with self.assertRaises(ValueError): session_message(at("2027-01-04"))
    def test_quote_must_be_current_and_not_future(self):
        now=at()
        self.assertFalse(stock_market.fresh_quote(quote(now-timedelta(days=1)),now))
        self.assertFalse(stock_market.fresh_quote(quote(now+timedelta(minutes=1)),now))
        self.assertTrue(stock_market.fresh_quote(quote(now),now))
    def test_fund_fills_keep_sub_cent_precision(self):
        q=etf_quote(at(),0.955)
        self.assertEqual(execution_price(q,100,"buy",ETF_RULES),0.957)
        self.assertEqual(execution_price(q,100,"sell",ETF_RULES),0.953)
        self.assertEqual(execution_price(quote(at()),100,"buy"),10.02)
    def test_minimum_fee_tax_and_slippage(self):
        self.assertEqual(fees(10,100,"buy"),5.01)
        self.assertEqual(fees(10,100,"sell"),5.51)
        q=quote(at())
        self.assertGreater(execution_price(q,100,"buy"),q["ask"])
        self.assertLess(execution_price(q,100,"sell"),q["bid"])
    def test_lot_size_cash_and_liquidity(self):
        q=quote(at())
        order=entry_order(q,10000)
        self.assertEqual(order["quantity"]%100,0)
        self.assertLessEqual(order["entry_cash"],10000)
        q["ask_size"]=10
        self.assertIsNone(entry_order(q,10000))
    def test_t1_and_gap_stop_actual_price(self):
        trade={"entry_day":date(2026,10,8),"entry_price":10,"peak_price":10,"quantity":1000,"entry_cash":10005.1}
        q=quote(at("2026-10-09","09:35:00"),8.5)
        self.assertIsNone(exit_reason(trade,q,at()))
        self.assertEqual(exit_reason(trade,q,at("2026-10-09","09:35:00")),"止损")
        self.assertLess(close_accounting(trade,q)["net_return"],-15)
        q["bid_size"]=0
        self.assertIsNone(close_accounting(trade,q))
    def test_trailing_uses_observed_peak_not_daily_high(self):
        trade={"entry_day":date(2026,10,8),"entry_price":10,"peak_price":10.2}
        q=quote(at("2026-10-09"),10.3); q["high"]=12
        self.assertIsNone(exit_reason(trade,q,at("2026-10-09")))
        trade["peak_price"]=10.8
        self.assertEqual(exit_reason(trade,q,at("2026-10-09")),"回撤止盈")
    def test_tenth_trading_day_at_tail(self):
        trade={"entry_day":date(2026,9,30),"entry_price":10,"peak_price":10}
        q=quote(at("2026-10-21","14:55:00"))
        self.assertEqual(exit_reason(trade,q,at("2026-10-21","14:55:00")),"持仓到期")
        self.assertIsNone(exit_reason(trade,q,at("2026-10-21","09:35:00")))
    def test_pullback_and_no_future_daily_close(self):
        days=[]; day=date(2026,5,1)
        while day<date(2026,10,8):
            if is_trade_day(day): days.append(day)
            day+=timedelta(days=1)
        closes=[8+i*0.025 for i in range(len(days))]
        closes[-5:]=[11.1,11.3,11.15,11.0,10.9]
        bars=[{"date":d.isoformat(),"open":c,"close":c,"high":c+0.03,"low":c-0.03,"volume":1000000 if i<len(days)-3 else 600000} for i,(d,c) in enumerate(zip(days,closes))]
        q=quote(at(),11.05); q.update(prev_close=10.9,low=10.9,volume=900000)
        row={"symbol":"000001","name":"样本股票","sector":"样本行业","amount":2e8}
        sector={"mean_pct":1,"up_ratio":0.7}; market={"allow_recommend":True}
        # Normalize history to a smooth rising trend with a local pullback.
        for i in range(len(bars)-5):
            c=8+i*(3/(len(bars)-5))
            bars[i].update(open=c,close=c,high=c+0.03,low=c-0.03)
        result=evaluate_pullback(row,bars,q,at(),sector,market)
        self.assertIsNotNone(result)
        future={"date":"2026-10-08","open":100,"close":100,"high":100,"low":100,"volume":999999999}
        self.assertEqual(result,evaluate_pullback(row,bars+[future],q,at(),sector,market))
        self.assertIsNone(evaluate_pullback(row,bars,q,at(),sector,{"allow_recommend":False}))

class EtfDipRulesTests(unittest.TestCase):
    def test_registry_runs_primary_first_and_keeps_versions_apart(self):
        self.assertEqual(list(STRATEGY_RULES),[ETF,"pullback-v1"])
        self.assertEqual(stocks.rules_for(None)["version"],ETF)
        self.assertEqual(set(stocks.SCREENS),set(STRATEGY_RULES))
        self.assertEqual(set(stocks.EXITS),set(STRATEGY_RULES))
        with self.assertRaises(Exception): stocks.rules_for("unknown")
        symbols=[s for members in ETF_RULES["families"].values() for s in members]
        self.assertEqual(len(symbols),len(set(symbols)))
    def test_exchange_prefix_for_funds(self):
        self.assertEqual([stock_market.exchange(s) for s in ("513100","159941","600000","000001")],["sh","sz","sh","sz"])
    def test_etf_fees_have_no_stamp_tax_or_transfer_fee(self):
        self.assertEqual(fees(1.0,9900,"buy",ETF_RULES),5.0)
        self.assertEqual(fees(1.0,9900,"sell",ETF_RULES),5.0)
        self.assertEqual(fees(2.0,25000,"sell",ETF_RULES),15.0)
    def test_wilder_rsi(self):
        self.assertEqual(rsi([10,10,10,10]),50.0)
        self.assertEqual(rsi([10,10.1,10.2]),100.0)
        self.assertEqual(rsi([10,10,10,9.5,9.0]),0.0)
        self.assertAlmostEqual(rsi([10,10.2,10.0,9.9]),20.0)
    def test_setup_needs_sharp_drop_liquidity_and_ignores_today_bar(self):
        now=at()
        bars=etf_bars([1.0]*38+[0.99,0.98])
        found=etf_dip_setup(bars,etf_quote(now,0.955),now)
        self.assertLess(found["rsi"],5)
        self.assertEqual(found["two_day_pct"],-3.54)
        self.assertEqual(len(found["history"]),40)
        future={"date":"2026-10-08","open":9,"close":9,"high":9,"low":9,"volume":1,"amount":1}
        self.assertEqual(found["rsi"],etf_dip_setup(bars+[future],etf_quote(now,0.955),now)["rsi"])
        self.assertIsNone(etf_dip_setup(bars,etf_quote(now,0.985),now))
        self.assertIsNone(etf_dip_setup(etf_bars([1.0]*38+[0.99,0.98],amount=4e7),etf_quote(now,0.955),now))
        self.assertIsNone(etf_dip_setup(bars,etf_quote(now-timedelta(minutes=5),0.955),now))
        self.assertIsNone(etf_dip_setup(bars[-20:],etf_quote(now,0.955),now))
    def test_setup_rejects_unknown_price_basis(self):
        now=at()
        split=etf_bars([2.0]*30+[1.0]*8+[0.99,0.98])
        self.assertIsNone(etf_dip_setup(split,etf_quote(now,0.955),now))
        bars=etf_bars([1.0]*38+[0.99,0.98])
        self.assertIsNone(etf_dip_setup(bars,etf_quote(now,0.955,prev=0.49),now))
    def test_sina_bars_without_amount_use_volume_times_close(self):
        now=at()
        bars=etf_bars([1.0]*38+[0.99,0.98])
        for b in bars: del b["amount"]
        self.assertEqual(etf_dip_setup(bars,etf_quote(now,0.955),now)["amount_20d"],80000000)
    def test_premium_uses_only_published_sessions(self):
        bars=etf_bars([1.02]*40)
        navs={b["date"]:1.0 for b in bars}
        self.assertEqual(premium_level(bars,navs),2.0)
        bars[-1]["close"]=9.9
        self.assertEqual(premium_level(bars,navs),2.0)
        bars[-2]["close"]=1.07
        self.assertEqual(premium_level(bars,navs),3.0)
    def test_premium_borrows_recent_nav_and_fails_closed(self):
        bars=etf_bars([1.02]*40)
        navs={b["date"]:1.0 for b in bars}
        del navs[bars[-3]["date"]]
        self.assertEqual(premium_level(bars,navs),2.0)
        for b in bars[-9:]: navs.pop(b["date"],None)
        self.assertIsNone(premium_level(bars,navs))
        self.assertIsNone(premium_level(bars[:4],{b["date"]:1.0 for b in bars}))
    def test_exit_target_rebound_time_limit_and_no_stop(self):
        trade={"entry_day":date(2026,10,8),"entry_price":1.0}
        closes=[1.0,1.0,1.0,0.98,0.96]
        q=etf_quote(at("2026-10-09","09:35:00"),1.021)
        self.assertIsNone(etf_exit_reason(trade,etf_quote(at(time="14:56:00"),1.05),at(time="14:56:00"),closes=closes))
        self.assertEqual(etf_exit_reason(trade,q,at("2026-10-09","09:35:00"),closes=closes),"止盈")
        q["last"]=0.9
        self.assertIsNone(etf_exit_reason(trade,q,at("2026-10-09","09:35:00"),closes=closes))
        self.assertIsNone(etf_exit_reason(trade,q,at("2026-10-09","14:55:00"),closes=closes))
        q["last"]=0.99
        self.assertIsNone(etf_exit_reason(trade,q,at("2026-10-09","13:00:00"),closes=closes))
        self.assertEqual(etf_exit_reason(trade,q,at("2026-10-09","14:55:00"),closes=closes),"反弹离场")
        q["last"]=0.9
        self.assertIsNone(etf_exit_reason(trade,q,at("2026-10-21","14:55:00"),closes=closes))
        self.assertEqual(etf_exit_reason(trade,q,at("2026-10-22","14:55:00"),closes=closes),"持仓到期")
        self.assertIsNone(etf_exit_reason(trade,q,at("2026-10-22","10:00:00"),closes=closes))

class EtfDipScreenTests(unittest.TestCase):
    def feeds(self,now,quotes=None,bars=None,navs=None):
        pool=[s for members in ETF_RULES["families"].values() for s in members]
        qmap={s:etf_quote(now,0.985,symbol=s,name="平稳"+s) for s in pool}
        qmap.update(quotes or {})
        dip=etf_bars([1.0]*38+[0.99,0.98])
        def daily(symbol,limit=100):
            value=(bars or {}).get(symbol,dip)
            if isinstance(value,Exception): raise value
            return value
        def fund(symbol,limit=20):
            value=(navs or {}).get(symbol,{b["date"]:b["close"]/1.01 for b in dip})
            if isinstance(value,Exception): raise value
            return value
        return patch("stock_market.quotes",return_value=qmap),patch("stock_market.daily_bars",side_effect=daily),patch("stock_market.fund_navs",side_effect=fund)
    def run_screen(self,now,**kwargs):
        a,b,c=self.feeds(now,**kwargs)
        with a,b,c: return stocks.screen_etf_dip(now)
    def test_quiet_market_gives_no_signal(self):
        result=self.run_screen(at())
        self.assertEqual(result["items"],[])
        self.assertTrue(result["data_ok"])
        self.assertEqual(result["scan_count"],23)
        self.assertEqual(len(result["watch"]),5)
        self.assertGreaterEqual(result["watch"][0]["rsi"],5)
    def test_lowest_premium_member_per_family_ordered_by_rsi(self):
        now=at()
        dip=etf_bars([1.0]*38+[0.99,0.98])
        quotes={"513100":etf_quote(now,0.955,symbol="513100",name="纳指甲"),
                "159941":etf_quote(now,0.955,symbol="159941",name="纳指乙"),
                "513030":etf_quote(now,0.94,symbol="513030",name="德国")}
        navs={"513100":{b["date"]:b["close"]/1.025 for b in dip},"159941":{b["date"]:b["close"]/1.004 for b in dip}}
        result=self.run_screen(now,quotes=quotes,navs=navs)
        self.assertEqual([i["symbol"] for i in result["items"]],["513030","159941"])
        self.assertEqual(result["items"][1]["sector"],"纳斯达克100")
        self.assertEqual(result["items"][1]["metrics"]["premium_pct"],0.4)
        self.assertEqual(result["items"][0]["quote"]["last"],0.94)
        self.assertTrue(result["data_ok"])
        self.assertEqual([w["symbol"] for w in result["watch"][:3]],["513100","159941","513030"])
        self.assertNotIn("history",result["items"][0]["metrics"])
    def test_rich_premium_is_blocked_not_bought(self):
        now=at()
        dip=etf_bars([1.0]*38+[0.99,0.98])
        result=self.run_screen(now,quotes={"513400":etf_quote(now,0.955,symbol="513400",name="道琼斯")},
            navs={"513400":{b["date"]:b["close"]/1.08 for b in dip}})
        self.assertEqual(result["items"],[])
        self.assertEqual(result["premium_blocked"][0]["symbol"],"513400")
        self.assertIn("溢价超过3%",result["message"])
    def test_unverified_nav_or_bars_block_formal_signal(self):
        now=at()
        quotes={"513400":etf_quote(now,0.955,symbol="513400",name="道琼斯")}
        result=self.run_screen(now,quotes=quotes,navs={"513400":RuntimeError("offline")})
        self.assertEqual(result["items"],[])
        self.assertFalse(result["data_ok"])
        result=self.run_screen(now,quotes=quotes,navs={"513400":{"2026-09-01":1.0}})
        self.assertFalse(result["data_ok"])
        result=self.run_screen(now,bars={"513030":RuntimeError("offline")})
        self.assertFalse(result["data_ok"])
        result=self.run_screen(now,bars={"513030":[{"date":"2026-10-07"}]*40})
        self.assertFalse(result["data_ok"])
        self.assertEqual(result["data_error_count"],1)
    def test_missing_quotes_for_most_funds_stop_the_screen(self):
        now=at()
        a,b,c=self.feeds(now)
        with patch("stock_market.quotes",return_value={}),b,c:
            with self.assertRaisesRegex(RuntimeError,"大面积缺失"): stocks.screen_etf_dip(now)

class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/"tracking.db"
        stocks.wire(None,None,lambda:Connection(self.path),None)
        with stocks.db(write=True) as cur: stocks.ensure_stock_pick_tables(cur)
    def tearDown(self):
        stocks.wire(None,None,None,None)
        self.tmp.cleanup()
    def job(self,now,screen_data=None,q=None,bars=None,finished=None,version="pullback-v1"):
        with patch("stocks.cn_now",return_value=finished or now), \
             patch("stocks.compute_screen",return_value=screen_data or screen(now)), \
             patch("stock_market.quotes",return_value={"000001":q or quote(now)}), \
             patch("stock_market.daily_bars",return_value=bars or [{"date":"2026-10-07","close":10}]*70):
            return stocks.run_job(now,version)
    def etf_screen(self,now,last=0.955):
        return {"version":ETF,"generated_at":now.strftime("%Y-%m-%d %H:%M:%S"),"data_ok":True,"message":"测试行情",
            "items":[{"symbol":"513030","name":"德国ETF","sector":"德国DAX","quote":etf_quote(now,last),
                      "match_score":97,"metrics":{},"reason":"测试信号"}]}
    def etf_job(self,now,last,screen_data=None,bars=None,prev=0.98):
        with patch("stocks.cn_now",return_value=now), \
             patch("stocks.compute_screen",return_value=screen_data or self.etf_screen(now,last)), \
             patch("stock_market.quotes",return_value={"513030":etf_quote(now,last,prev=prev)}), \
             patch("stock_market.daily_bars",return_value=bars or etf_bars([1.0]*38+[0.99,0.98])):
            return stocks.run_job(now,ETF)
    def etf_rows(self):
        return [r for r in self.rows() if r["version"]==ETF]
    def rows(self):
        with stocks.db() as cur:
            cur.execute("SELECT * FROM stock_strategy_trades ORDER BY id")
            return cur.fetchall()
    def entered(self):
        self.job(at())
        self.job(at(time="14:55:00"))
        return self.rows()[0]
    def test_closed_preview_and_dashboard_explain_without_saving(self):
        with patch("stocks.cn_now",return_value=at("2026-10-10")), patch("stocks.compute_screen") as compute:
            preview=stocks.recommend(_admin={})
            status=stocks.dashboard()
        compute.assert_not_called()
        self.assertIn("今日周六休市",preview["message"])
        self.assertEqual(preview["message"],status["session_message"])
        self.assertEqual(preview["generated_at"],"2026-10-10 14:50:00")
        self.assertEqual(status["phase"],"closed")
        self.assertEqual(self.rows(),[])
    def test_unverified_calendar_dashboard_explains_pause(self):
        with patch("stocks.cn_now",return_value=at("2027-01-04")):
            status=stocks.dashboard()
        self.assertFalse(status["calendar_ok"])
        self.assertIn("2027年交易日历尚未核验",status["session_message"])
    def test_signal_replay_immutable_and_entry_replay(self):
        self.job(at())
        snapshot=self.rows()[0]["snapshot_json"]
        changed=screen(at()); changed["items"][0]["quote"]["last"]=99
        self.assertTrue(self.job(at(),changed)["reused"])
        self.assertEqual(self.rows()[0]["snapshot_json"],snapshot)
        self.job(at(time="14:55:00"))
        self.assertEqual(self.rows()[0]["status"],"open")
        self.assertTrue(self.job(at(time="14:55:00"))["reused"])
        self.assertEqual(len(self.rows()),1)
    def test_preview_and_late_signal_not_saved(self):
        self.job(at(time="14:40:00"))
        self.assertEqual(self.rows(),[])
        result=self.job(at(),finished=at(time="14:56:00"))
        self.assertFalse(result["success"])
        self.assertEqual(self.rows(),[])
    def test_partial_data_no_formal_signal(self):
        s=screen(at()); s["data_ok"]=False
        self.assertFalse(self.job(at(),s)["success"])
        self.assertEqual(self.rows(),[])
    def test_no_newer_quote_no_fill_then_recover(self):
        self.job(at())
        self.job(at(time="14:55:00"),q=quote(at()))
        self.assertEqual(self.rows()[0]["status"],"queued")
        self.job(at(time="14:55:30"))
        self.assertEqual(self.rows()[0]["status"],"open")
    def test_expired_entry_not_backfilled(self):
        self.job(at())
        self.job(at(time="15:10:00"))
        self.assertEqual(self.rows()[0]["status"],"expired")
        self.job(at("2026-10-09","14:55:00"))
        self.assertEqual(self.rows()[0]["status"],"expired")
    def test_price_drift_abandons_entry(self):
        self.job(at())
        self.job(at(time="14:55:00"),q=quote(at(time="14:55:00"),10.5))
        self.assertEqual(self.rows()[0]["status"],"expired")
    def test_same_day_stop_cannot_sell(self):
        self.entered()
        self.job(at(time="14:56:00"),q=quote(at(time="14:56:00"),8.5))
        self.assertEqual(self.rows()[0]["status"],"open")
    def test_next_day_gap_exit_net_stats_and_no_overwrite(self):
        t=self.entered()
        now=at("2026-10-09","09:35:00")
        self.job(now,q=quote(now,8.5),bars=[{"date":"2026-10-08","close":10}]*70)
        closed=self.rows()[0]
        self.assertEqual(closed["status"],"closed")
        self.assertLess(closed["net_return"],-15)
        self.assertEqual(t["entry_price"],closed["entry_price"])
        with stocks.db() as cur:
            s=stocks.stats(cur)
        self.assertEqual(s["settled"],1); self.assertEqual(s["win_rate"],0)
        self.assertLess(s["max_drawdown"],0)
    def test_blocked_exit_retains_position(self):
        self.entered()
        now=at("2026-10-09","09:35:00"); q=quote(now,8.5); q["bid_size"]=0
        self.job(now,q=q,bars=[{"date":"2026-10-08","close":10}]*70)
        self.assertEqual(self.rows()[0]["status"],"open")
        self.assertIn("买盘不足",self.rows()[0]["note"])
    def test_corporate_action_not_counted_as_win(self):
        self.entered()
        now=at("2026-10-09","09:35:00"); q=quote(now,8.5); q["prev_close"]=8.6
        self.job(now,q=q,bars=[{"date":"2026-10-08","close":10}]*70)
        self.assertEqual(self.rows()[0]["status"],"review")
        with stocks.db() as cur: s=stocks.stats(cur)
        self.assertEqual(s["settled"],0); self.assertIsNone(s["win_rate"])
    def test_read_endpoints_do_not_write_or_use_page_for_stats(self):
        self.entered()
        before=self.rows()
        listed=stocks.records(limit=20,offset=0,state="",version="pullback-v1",_admin={})
        self.assertEqual(listed["total"],1)
        self.assertEqual(stocks.records(limit=20,offset=0,state="",version="",_admin={})["total"],0)
        data=stocks.review_export(90)
        self.assertEqual(data["rules"]["version"],ETF)
        self.assertEqual(data["trades"],[])
        self.assertEqual(data["others"]["pullback-v1"]["rules"]["version"],"pullback-v1")
        self.assertEqual(len(data["others"]["pullback-v1"]["trades"]),1)
        self.assertNotIn("others",stocks.review_export(90,"pullback-v1"))
        self.assertEqual(self.rows(),before)
    def test_retired_routes_and_admin_gate(self):
        paths={r.path for r in stocks.router.routes}
        self.assertNotIn("/stocks/recommend-tail-buy",paths)
        self.assertNotIn("/stocks/recommend-monthly-recovery",paths)
        self.assertNotIn("/stocks/recommend-monster-stock",paths)
        with self.assertRaises(Exception): stocks._admin_user(None)

    def test_position_cap_and_available_cash(self):
        self.entered()
        with stocks.db(write=True) as cur:
            for code in ('000002','000003'):
                cur.execute("""INSERT INTO stock_strategy_trades(version,symbol,name,sector,signal_day,signal_at,snapshot_json,status,
                    entry_day,entry_at,entry_price,quantity,entry_fee,entry_cash,last_price,last_at,peak_price)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    ('pullback-v1',code,'测试持仓','测试行业',date(2026,10,8),stocks.utc_naive(at()),'{}','open',
                     date(2026,10,8),stocks.utc_naive(at(time='14:55:00')),10,900,5,9005,10,stocks.utc_naive(at(time='14:55:00')),10))
        next_day=at('2026-10-09')
        self.job(next_day)
        self.job(at('2026-10-09','14:55:00'))
        self.assertEqual(sum(r['status']=='open' for r in self.rows()),3)
        self.assertEqual(self.rows()[-1]['status'],'expired')

    def test_etf_target_exit_net_of_etf_fees_and_separate_stats(self):
        self.etf_job(at(),0.955)
        self.etf_job(at(time="14:55:00"),0.955)
        opened=self.etf_rows()[0]
        self.assertEqual(opened["status"],"open")
        self.assertEqual(opened["quantity"]%100,0)
        self.assertLessEqual(opened["entry_cash"],10000)
        self.assertEqual(opened["entry_fee"],5.0)
        self.assertEqual(opened["entry_price"],0.957)
        self.etf_job(at(time="14:56:00"),0.99)
        self.assertEqual(self.etf_rows()[0]["status"],"open")
        bars=etf_bars([1.0]*38+[0.99,0.98,0.955],end="2026-10-09")
        self.etf_job(at("2026-10-09","09:35:00"),0.97,bars=bars,prev=0.955)
        self.assertEqual(self.etf_rows()[0]["status"],"open")
        self.etf_job(at("2026-10-09","09:40:00"),0.98,bars=bars,prev=0.955)
        closed=self.etf_rows()[0]
        self.assertEqual(closed["status"],"closed")
        self.assertEqual(closed["exit_reason"],"止盈")
        self.assertEqual(closed["exit_fee"],5.0)
        self.assertGreater(closed["net_return"],2.0)
        with stocks.db() as cur:
            self.assertEqual(stocks.stats(cur,ETF)["win_rate"],100)
            self.assertEqual(stocks.stats(cur,"pullback-v1")["total"],0)
        self.assertEqual(stocks.dashboard(ETF)["stats"]["settled"],1)
        self.assertEqual(stocks.dashboard("pullback-v1")["stats"]["settled"],0)
    def test_etf_rebound_exit_only_at_tail(self):
        self.etf_job(at(),0.955)
        self.etf_job(at(time="14:55:00"),0.955)
        bars=etf_bars([1.0]*36+[0.99,0.98,0.955,0.95,0.95],end="2026-10-13")
        self.etf_job(at("2026-10-13","13:00:00"),0.97,bars=bars,prev=0.95)
        self.assertEqual(self.etf_rows()[0]["status"],"open")
        self.etf_job(at("2026-10-13","14:55:00"),0.97,bars=bars,prev=0.95)
        closed=self.etf_rows()[0]
        self.assertEqual((closed["status"],closed["exit_reason"]),("closed","反弹离场"))
        self.assertLess(closed["net_return"],2.0)
    def test_etf_scale_in_adds_a_lot_of_the_same_fund(self):
        self.etf_job(at(),0.955)
        self.etf_job(at(time="14:55:00"),0.955)
        bars=etf_bars([1.0]*38+[0.99,0.98,0.955],end="2026-10-09")
        nxt=at("2026-10-09")
        self.etf_job(nxt,0.93,screen_data=self.etf_screen(nxt,0.93),bars=bars,prev=0.955)
        self.etf_job(at("2026-10-09","14:55:00"),0.93,bars=bars,prev=0.955)
        self.assertEqual([r["status"] for r in self.etf_rows()],["open","open"])
        with stocks.db() as cur:
            self.assertLess(stocks._cash(cur,stocks._open_rows(cur,ETF_RULES),ETF_RULES),10100)
            self.assertEqual(stocks._cash(cur,stocks._open_rows(cur,RULES),RULES),RULES["capital"])
    def test_etf_split_marks_review_instead_of_profit(self):
        self.etf_job(at(),0.955)
        self.etf_job(at(time="14:55:00"),0.955)
        nxt=at("2026-10-09","09:35:00")
        self.etf_job(nxt,1.9,bars=etf_bars([1.0]*38+[0.99,0.98,0.955],end="2026-10-09"),prev=1.91)
        self.assertEqual(self.etf_rows()[0]["status"],"review")
    def test_run_all_strategies_reports_each_and_survives_one_failure(self):
        now=at()
        def screens(when,version="pullback-v1"):
            if version==ETF: raise RuntimeError("ETF行情或净值大面积缺失，暂停正式信号")
            return screen(when)
        with patch("stocks.cn_now",return_value=now), patch("stocks.compute_screen",side_effect=screens), \
             patch("stock_market.quotes",return_value={"000001":quote(now)}), \
             patch("stock_market.daily_bars",return_value=[{"date":"2026-10-07","close":10}]*70):
            result=stocks.run_job(now)
        self.assertEqual(list(result["strategies"]),[ETF,"pullback-v1"])
        self.assertFalse(result["success"])
        self.assertTrue(result["strategies"]["pullback-v1"]["success"])
        self.assertTrue(result["errors"][0].startswith("指数ETF急跌低吸："))
        self.assertEqual([r["version"] for r in self.rows()],["pullback-v1"])
        closed=stocks.run_job(at("2026-10-10"))
        self.assertTrue(closed["success"])
        self.assertIn("非执行时段",closed["message"])

    def test_api_requires_admin_and_paginates(self):
        from fastapi import FastAPI, HTTPException
        from fastapi.testclient import TestClient
        app=FastAPI(); app.include_router(stocks.router)
        def user(creds):
            if not creds: raise HTTPException(401,'请登录')
            return {'role':creds.credentials}
        def admin(u):
            if u['role']!='admin': raise HTTPException(403,'管理员权限')
        stocks.wire(user,admin,lambda:Connection(self.path),None)
        client=TestClient(app)
        self.assertEqual(client.get('/stocks/status').status_code,401)
        self.assertEqual(client.get('/stocks/status',headers={'Authorization':'Bearer user'}).status_code,403)
        result=client.get('/stocks/records?limit=20&offset=0',headers={'Authorization':'Bearer admin'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['total'],0)
        self.assertEqual(client.get('/stocks/records?limit=21',headers={'Authorization':'Bearer admin'}).status_code,422)
        self.assertEqual(client.get('/stocks/records?version=nope',headers={'Authorization':'Bearer admin'}).status_code,400)
        status=client.get('/stocks/status',headers={'Authorization':'Bearer admin'}).json()
        self.assertEqual(status['rules']['version'],ETF)
        self.assertEqual([s['version'] for s in status['strategies']],[ETF,'pullback-v1'])
        self.assertEqual(client.get('/stocks/status?version=pullback-v1',headers={'Authorization':'Bearer admin'}).json()['rules']['name'],'回调企稳')
        self.assertEqual(client.get('/stocks/preview').status_code,401)

if __name__=="__main__":
    unittest.main()
