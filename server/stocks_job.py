"""Server scheduler and read-only export used by the stock-review skill."""
import argparse
import json
import os
import sys
import pymysql
import stocks
from stock_calendar import cn_now

def connection():
    return pymysql.connect(host=os.environ.get("DB_HOST","127.0.0.1"),
        port=int(os.environ.get("DB_PORT","3306")),user=os.environ.get("DB_USER","toolbasecamp"),
        password=os.environ.get("DB_PASSWORD","toolbasecamp"),database=os.environ.get("DB_NAME","toolbasecamp"),
        charset="utf8mb4",cursorclass=pymysql.cursors.DictCursor,autocommit=True)

def main():
    if hasattr(sys.stdout,"reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser=argparse.ArgumentParser()
    parser.add_argument("--export",action="store_true",help="Read-only review JSON")
    parser.add_argument("--probe",action="store_true",help="Read-only data probe, no signals or fills")
    parser.add_argument("--init",action="store_true",help="Install tables under the database write lock")
    parser.add_argument("--days",type=int,default=90)
    args=parser.parse_args()
    if not 7<=args.days<=365:
        parser.error("--days must be between 7 and 365")
    stocks.wire(None,None,connection,None)
    try:
        if args.init:
            with stocks.db(write=True) as cur:
                stocks.ensure_stock_pick_tables(cur)
            result={"success":True,"message":"股票记录表已就绪"}
        elif args.export:
            result=stocks.review_export(args.days)
        elif args.probe:
            result=stocks.compute_screen(cn_now())
        else:
            result=stocks.run_job()
        print(stocks.dump(result))
        return 0 if result.get("success",result.get("data_ok",True)) else 1
    except Exception as exc:
        print(json.dumps({"success":False,"error_type":type(exc).__name__,
            "message":str(exc) if isinstance(exc,(RuntimeError,ValueError)) else "股票任务未完成，请检查服务日志、行情源和数据库状态"},ensure_ascii=False))
        return 1

if __name__=="__main__":
    raise SystemExit(main())
