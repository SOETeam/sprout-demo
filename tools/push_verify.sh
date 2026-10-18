#!/bin/bash
# Push main (what GitHub Pages serves), wait for deployment to settle, verify live.
set -e
cd /root/sprout-demo

git push origin main 2>&1 | tail -3

echo "waiting 20s for Pages deploy settle..."
sleep 20

echo "verifying live URL:"
curl -s -o /dev/null -w "%{http_code}" https://soeteam.github.io/sprout-demo/
echo ""
curl -s -o /dev/null -w "%{http_code}" https://soeteam.github.io/sprout-demo/js/sync.js
echo ""
