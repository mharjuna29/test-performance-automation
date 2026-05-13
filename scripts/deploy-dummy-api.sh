#!/bin/bash
set -euo pipefail

SSH_KEY="$HOME/.ssh/testing_server_key"
REMOTE_DIR="/opt/pbx-dummy-api"

: "${SSH_HOST:?SSH_HOST is required}"
: "${SSH_PORT:?SSH_PORT is required}"
: "${SSH_USERNAME:?SSH_USERNAME is required}"
: "${DUMMY_API_PORT:?DUMMY_API_PORT is required}"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "mkdir -p $REMOTE_DIR"
scp -i "$SSH_KEY" -P "$SSH_PORT" -r dummy-api/* "$SSH_USERNAME@$SSH_HOST:$REMOTE_DIR/"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  set -e
  cd $REMOTE_DIR
  if ! command -v node >/dev/null 2>&1; then
    echo 'Node.js is not installed on remote server.'
    echo 'Install Node.js first, then rerun the workflow.'
    exit 1
  fi
  npm install
  pkill -f 'node server.js' || true
  PORT=$DUMMY_API_PORT nohup node server.js > dummy-api.log 2>&1 &
  sleep 5
  curl -f http://localhost:$DUMMY_API_PORT/health
"

echo "Dummy API deployed and running at http://$SSH_HOST:$DUMMY_API_PORT"
