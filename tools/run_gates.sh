#!/bin/bash
# SPROUT demo gate runner — node --check + validator + html.parser (not destructive)
set -e
cd /root/sprout-demo

for f in js/sync.js js/app.js tools/validate_sync.js; do
  node --check "$f"
  echo "node --check OK: $f"
done

node tools/validate_sync.js

python3 - <<'PYEOF'
from html.parser import HTMLParser
class P(HTMLParser):
    pass
p = P()
p.feed(open('index.html').read())
print('html.parser OK')
PYEOF
