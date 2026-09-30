#!/usr/bin/env bash
# Chromium's four missing libraries, fetched without sudo (memory: reference_local_screenshot_setup).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p debs chromelibs
cd debs
apt-get download libnspr4 libnss3 libasound2t64
for d in *.deb; do dpkg-deb -x "$d" ../chromelibs; done
echo "LD_LIBRARY_PATH=$(cd ../chromelibs && pwd)/usr/lib/x86_64-linux-gnu"
