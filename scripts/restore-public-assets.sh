#!/bin/sh
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
python3 - << 'PY'
from pathlib import Path
import base64
root = Path(".")
payload = root / "scripts/assets-b64"
if payload.exists():
    for p in sorted(payload.rglob("*.b64")):
        dest = root / "public" / p.relative_to(payload).as_posix()[:-4]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(p.read_text()))
        print("restored", dest, dest.stat().st_size)
font = root / "public/fonts/PretendardVariable.woff2"
if not font.exists() or font.stat().st_size == 0:
    raise SystemExit("font missing — download in CI before this check")
print("font ok", font.stat().st_size)
PY
