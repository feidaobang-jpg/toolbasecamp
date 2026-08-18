#!/usr/bin/env python3
"""Upsert DNSPod A records for zhengxiaohui.cn portal subdomains."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ENV_FILE = os.environ.get("API_ENV", "/etc/toolbasecamp-api.env")
DOMAIN = "zhengxiaohui.cn"
ORIGIN_IP = "111.229.172.111"
SUBS = ("dev", "chef", "news", "hoppscotch", "pdf", "translate")


def load_env(path: str) -> None:
    p = Path(path)
    if not p.is_file():
        raise SystemExit(f"ERROR: env file missing: {path}")
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip("'").strip('"'))


def main() -> int:
    load_env(ENV_FILE)
    sid = (os.environ.get("TENCENT_SECRET_ID") or "").strip()
    skey = (os.environ.get("TENCENT_SECRET_KEY") or "").strip()
    if not sid or not skey:
        print("ERROR: TENCENT_SECRET_ID / TENCENT_SECRET_KEY missing")
        return 1

    from tencentcloud.common import credential
    from tencentcloud.dnspod.v20210323 import dnspod_client, models

    cred = credential.Credential(sid, skey)
    client = dnspod_client.DnspodClient(cred, "")
    req = models.DescribeRecordListRequest()
    req.Domain = DOMAIN
    req.Limit = 200
    existing = {}
    try:
        resp = client.DescribeRecordList(req)
        for rec in resp.RecordList or []:
            existing[(rec.Name, rec.Type)] = rec
    except Exception as exc:
        print(f"ERROR: DescribeRecordList failed: {exc}")
        return 1

    changed = 0
    for sub in SUBS:
        key = (sub, "A")
        rec = existing.get(key)
        if rec is not None:
            if rec.Value == ORIGIN_IP:
                print(f"OK exists {sub}.{DOMAIN} A {ORIGIN_IP}")
                continue
            mod = models.ModifyRecordRequest()
            mod.Domain = DOMAIN
            mod.RecordId = rec.RecordId
            mod.SubDomain = sub
            mod.RecordType = "A"
            mod.RecordLine = rec.Line or "默认"
            mod.Value = ORIGIN_IP
            client.ModifyRecord(mod)
            print(f"UPDATED {sub}.{DOMAIN} A {rec.Value} -> {ORIGIN_IP}")
            changed += 1
            continue
        cre = models.CreateRecordRequest()
        cre.Domain = DOMAIN
        cre.SubDomain = sub
        cre.RecordType = "A"
        cre.RecordLine = "默认"
        cre.Value = ORIGIN_IP
        cre.TTL = 600
        client.CreateRecord(cre)
        print(f"CREATED {sub}.{DOMAIN} A {ORIGIN_IP}")
        changed += 1

    print(f"DONE changed={changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
