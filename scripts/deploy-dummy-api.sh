#!/bin/bash

set -e

SSH_KEY="$HOME/.ssh/tester-pbx-key"
REMOTE_DIR="/opt/pbx-dummy-api"
PID_FILE="$REMOTE_DIR/dummy-api.pid"

echo "Deploying dummy API to testing server..."

echo "Creating remote directory..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  mkdir -p $REMOTE_DIR
"

echo "Copying dummy API files..."
scp -i "$SSH_KEY" -P "$SSH_PORT" -r dummy-api/* "$SSH_USERNAME@$SSH_HOST:$REMOTE_DIR/"

echo "Installing dependencies and starting dummy API..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  set -e

  cd $REMOTE_DIR

  echo 'Checking Node.js...'
  node -v
  npm -v

  echo 'Installing npm dependencies...'
  npm install

  echo 'Stopping previous dummy API process if exists...'
  if [ -f '$PID_FILE' ]; then
    OLD_PID=\$(cat '$PID_FILE' || true)

    if [ -n \"\$OLD_PID\" ] && kill -0 \"\$OLD_PID\" 2>/dev/null; then
      echo \"Stopping old process with PID \$OLD_PID\"
      kill \"\$OLD_PID\" || true
      sleep 2
    fi

    rm -f '$PID_FILE'
  fi

  echo 'Starting dummy API...'
  PORT=$DUMMY_API_PORT nohup node server.js > dummy-api.log 2>&1 &

  NEW_PID=\$!
  echo \$NEW_PID > '$PID_FILE'

  echo \"Dummy API started with PID \$NEW_PID\"

  sleep 5

  echo 'Checking dummy API health locally...'
  curl -f http://localhost:$DUMMY_API_PORT/health

  echo 'Dummy API deployment completed successfully.'
"

echo "Dummy API deployed and running."