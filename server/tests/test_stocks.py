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
from stock_strategy import RULES, close_accounting, entry_order, evaluate_pullback, execution_price, exit_reason, fees

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

class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/"tracking.db"
        stocks.wire(None,None,lambda:Connection(self.path),None)
        with stocks.db(write=True) as cur: stocks.ensure_stock_pick_tables(cur)
    def tearDown(self):
        stocks.wire(None,None,None,None)
        self.tmp.cleanup()
    def job(self,now,screen_data=None,q=None,bars=None,finished=None):
        with patch("stocks.cn_now",return_value=finished or now), \
             patch("stocks.compute_screen",return_value=screen_data or screen(now)), \
             patch("stock_market.quotes",return_value={"000001":q or quote(now)}), \
             patch("stock_market.daily_bars",return_value=bars or [{"date":"2026-10-07","close":10}]*70):
            return stocks.run_job(now)
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
        stocks.records(limit=20,offset=0,state="",_admin={})
        data=stocks.review_export(90)
        self.assertEqual(data["rules"]["version"],"pullback-v1")
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

if __name__=="__main__":
    unittest.main()
