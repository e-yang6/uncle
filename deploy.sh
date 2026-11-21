#!/bin/bash
# Only Person 1 runs this: bash deploy.sh  (see DEPLOY.md)
set -e
SERVER="root@144.202.9.158"
MODEL_SETTING=""
if [[ "${DEPLOY_MODEL_FIRST:-}" == "0" || "${DEPLOY_MODEL_FIRST:-}" == "1" ]]; then
  MODEL_SETTING="sed -i '/^MODEL_FIRST=/d' .env && echo MODEL_FIRST=${DEPLOY_MODEL_FIRST} >> .env && "
fi
ssh "$SERVER" "cd ~/uncle && ${MODEL_SETTING}git pull origin main && npm ci && npm run build --if-present && systemctl restart uncle && systemctl is-active uncle"
