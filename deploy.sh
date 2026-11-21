#!/bin/bash
# Only Person 1 runs this: bash deploy.sh  (see DEPLOY.md)
set -e
SERVER="root@144.202.9.158"
ssh "$SERVER" 'cd ~/uncle && git pull origin main && npm ci && npm run build --if-present && systemctl restart uncle && systemctl is-active uncle'
