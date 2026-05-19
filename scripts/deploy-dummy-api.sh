#!/bin/bash

# Configuration
SSH_USER="tester"
SSH_HOST="139.162.3.156"
SSH_KEY="/tmp/deploy_key"
# UBAH DARI /opt KE /home/tester
REMOTE_DIR="/home/tester/pbx-dummy-api"

echo "🚀 Deploying Dummy API to ${SSH_USER}@${SSH_HOST}"

# Create remote directory
# Tambahkan -p agar tidak error jika folder sudah ada
ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST} "mkdir -p ${REMOTE_DIR}"

# Copy files
scp -i $SSH_KEY -o StrictHostKeyChecking=no dummy-api/package.json ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/
scp -i $SSH_KEY -o StrictHostKeyChecking=no dummy-api/server.js ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/

# Install dependencies and start application
ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST} << 'ENDSSH'
# Masuk ke folder yang benar
cd /home/tester/pbx-dummy-api

# Install dependencies
npm install --production

# Stop aplikasi lama jika ada (ignore error jika belum ada)
pm2 delete dummy-pbx-api 2>/dev/null || true

# Start aplikasi baru
pm2 start server.js --name dummy-pbx-api

# Simpan daftar proses agar auto-restart saat reboot
pm2 save

# Setup startup script (hanya perlu dijalankan sekali, tapi aman jika dijalankan ulang)
pm2 startup 2>/dev/null || true
ENDSSH

echo "✅ Deployment completed successfully to ${REMOTE_DIR}"