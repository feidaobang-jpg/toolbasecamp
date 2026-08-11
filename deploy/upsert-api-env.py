#!/usr/bin/env python3
"""Safely upsert KEY=VALUE lines into /etc/toolbasecamp-api.env on the VPS.

Usage (on VPS):
  sudo python3 upsert-api-env.py TRADITIONAL_PREVIEW_BITRATE=64k
  sudo python3 upsert-api-env.py KEY1=val1 KEY2=val2

Never write literal backslash-n (\\\\n). Always use real newlines.
After writing, validates newline count and refuses to leave a one-line file.
"""
from __future__ import annotations

import sys
from pathlib import Path

ENV_PATH = Path("/etc/toolbasecamp-api.env")


def load_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8") if path.is_file() else ""
    # Repair accidental literal \\n from broken PowerShell/heredoc upserts
    if "\\n" in raw and raw.count("\n") < 5:
        raw = raw.replace("\\n", "\n")
    return raw


def upsert(text: str, pairs: dict[str, str]) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for ln in text.splitlines():
        if not ln.strip() or ln.lstrip().startswith("#"):
            lines.append(ln.rstrip())
            continue
        if "=" not in ln:
            lines.append(ln.rstrip())
            continue
        key = ln.split("=", 1)[0].strip()
        if key in pairs:
            lines.append(f"{key}={pairs[key]}")
            seen.add(key)
        else:
            lines.append(ln.rstrip())
    for key, val in pairs.items():
        if key not in seen:
            lines.append(f"{key}={val}")
    return "\n".join(lines).rstrip() + "\n"


def validate(out: str) -> None:
    if "\\n" in out:
        raise SystemExit("Refusing to write: literal \\\\n found in output")
    if out.count("\n") < 3:
        raise SystemExit("Refusing to write: too few real newlines (file would be corrupted)")
    for ln in out.splitlines():
        if not ln.strip() or ln.lstrip().startswith("#") or "=" not in ln:
            continue
        key, _, val = ln.partition("=")
        if not key.strip():
            raise SystemExit(f"Refusing to write: empty key in line {ln!r}")
        if "\\n" in key or "\\n" in val:
            raise SystemExit(f"Refusing to write: literal \\\\n in {key}")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: sudo python3 upsert-api-env.py KEY=VALUE [KEY=VALUE ...]")
    pairs: dict[str, str] = {}
    for arg in sys.argv[1:]:
        if "=" not in arg:
            raise SystemExit(f"Bad arg (need KEY=VALUE): {arg}")
        k, v = arg.split("=", 1)
        k, v = k.strip(), v.strip()
        if not k:
            raise SystemExit(f"Empty key: {arg}")
        if "\n" in k or "\n" in v or "\\" in k:
            raise SystemExit(f"Invalid KEY/VALUE (no newlines): {k}")
        pairs[k] = v
    text = load_text(ENV_PATH)
    out = upsert(text, pairs)
    validate(out)
    ENV_PATH.write_text(out, encoding="utf-8")
    print(f"Updated {ENV_PATH} ({out.count(chr(10))} lines)")
    for k in pairs:
        print(f"  {k}=***" if any(x in k.upper() for x in ("PASS", "SECRET", "KEY", "TOKEN")) else f"  {k}={pairs[k]}")


if __name__ == "__main__":
    main()
