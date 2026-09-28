#!/usr/bin/env python3
import json, urllib.request
url = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
with urllib.request.urlopen(url, timeout=30) as r:
    data = json.load(r)
for p in data:
    name = p.get("name", "")
    if "zh" in name and "en" in name:
        print(name)
        for link in p.get("links", []):
            print(" ", link)
