#!/bin/bash
set -euo pipefail

OUTPUT_DIR="$1"
SSH_KEY="$HOME/.ssh/tester-pbx-key"
mkdir -p "$OUTPUT_DIR"

: "${SSH_HOST:?SSH_HOST is required}"
: "${SSH_PORT:?SSH_PORT is required}"
: "${SSH_USERNAME:?SSH_USERNAME is required}"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USERNAME@$SSH_HOST" "
  echo '===== Storage Optimization ====='
  echo 'Generated at:' \\$(date)
  echo ''
  echo '[Before Optimization]'
  df -h || true
  echo ''
  echo '[Cleanup Actions]'
  echo '- Cleaning temporary files older than 7 days from /tmp'
  find /tmp -type f -mtime +7 -print -delete 2>/dev/null || true
  echo '- Cleaning npm cache'
  npm cache clean --force 2>/dev/null || true
  echo ''
  echo '[After Optimization]'
  df -h || true
  echo ''
  echo 'Storage optimization completed.'
" > "$OUTPUT_DIR/optimize-storage.txt"

echo "Remote storage optimization completed."
