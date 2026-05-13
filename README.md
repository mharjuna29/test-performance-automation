# PBX Performance Automation

Repository ini menjalankan dummy API via SSH, melakukan monitoring remote server, menjalankan k6 stress test, membuat HTML/PDF report, mengunggah artifact, dan mengirim email notifikasi.

## Secrets yang diperlukan

- SSH_HOST
- SSH_PORT
- SSH_USERNAME
- SSH_PRIVATE_KEY
- DUMMY_API_PORT
- SMTP_SERVER
- SMTP_PORT
- SMTP_USERNAME
- SMTP_PASSWORD
- SMTP_FROM

## Jadwal

Workflow dijadwalkan setiap Minggu 18:00 UTC, yang setara dengan Senin 01:00 WIB. Guard di workflow memastikan job hanya lanjut pada minggu pertama bulan berjalan.

## Manual run

GitHub → Actions → Monthly PBX Performance Test → Run workflow.
