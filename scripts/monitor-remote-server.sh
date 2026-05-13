#!/bin/bash
set -euo pipefail

OUTPUT_DIR="$1"
SSH_KEY="$HOME/.ssh/testing_server_key"
mkdir -p "$OUTPUT_DIR"

: "${SSH_HOST:?SSH_HOST is required}"
: "${SSH_PORT:?SSH_PORT is required}"
: "${SSH_USERNAME:?SSH_USERNAME is required}"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  echo '===== CPU & RAM Monitoring ====='
  echo 'Generated at:' \\$(date)
  echo ''
  echo '[CPU Info]'
  lscpu || true
  echo ''
  echo '[Memory Usage]'
  free -h || true
  echo ''
  echo '[Top CPU Processes]'
  ps aux --sort=-%cpu | head -10 || true
  echo ''
  echo '[Top Memory Processes]'
  ps aux --sort=-%mem | head -10 || true
" > "$OUTPUT_DIR/monitoring-cpu-ram.txt"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  echo '===== Storage Monitoring ====='
  echo 'Generated at:' \\$(date)
  echo ''
  echo '[Disk Usage]'
  df -h || true
  echo ''
  echo '[Largest Directories in /opt]'
  du -h --max-depth=1 /opt 2>/dev/null | sort -hr | head -10 || true
" > "$OUTPUT_DIR/monitoring-storage.txt"

echo "Remote monitoring completed."
