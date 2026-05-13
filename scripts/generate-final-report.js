const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return 'File not available.';
  }
}

function metric(summary, name, value, fallback = 0) {
  return summary.metrics?.[name]?.values?.[value] ?? fallback;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function mb(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function monthLabel(month) {
  const [year, mm] = month.split('-');
  const names = {
    '01': 'JANUARI', '02': 'FEBRUARI', '03': 'MARET', '04': 'APRIL',
    '05': 'MEI', '06': 'JUNI', '07': 'JULI', '08': 'AGUSTUS',
    '09': 'SEPTEMBER', '10': 'OKTOBER', '11': 'NOVEMBER', '12': 'DESEMBER',
  };
  return `${names[mm] || month} ${year}`;
}

async function main() {
  const month = getArg('month');
  const runDate = getArg('run-date', new Date().toISOString());
  const summaryPath = getArg('summary');
  const cpuRamPath = getArg('cpu-ram');
  const storagePath = getArg('storage');
  const optimizePath = getArg('optimize');
  const output = getArg('output');

  if (!month || !summaryPath || !output) {
    console.error('Missing required args: --month, --summary, --output');
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  const totalRequests = metric(summary, 'http_reqs', 'count');
  const status200 = metric(summary, 'status_200', 'count');
  const status429 = metric(summary, 'status_429', 'count');
  const status5xx = metric(summary, 'status_500', 'count');
  const failureRate = metric(summary, 'http_req_failed', 'rate');
  const p95 = metric(summary, 'http_req_duration', 'p(95)');
  const maxResponse = metric(summary, 'http_req_duration', 'max');
  const avgResponse = metric(summary, 'http_req_duration', 'avg');
  const rps = metric(summary, 'http_reqs', 'rate');

  const stabilityStatus = status5xx === 0 ? 'Stabil' : 'Perlu Investigasi';
  const latencyStatus = p95 < 6000 ? 'Dalam batas wajar' : 'Melebihi batas';
  const rateLimitStatus = status429 > 0 ? 'Rate limiting aktif' : 'Rate limiting tidak terdeteksi';

  const conclusion = status5xx === 0 && p95 < 6000
    ? 'Pengujian performance berhasil dijalankan. Sistem dummy tetap merespons tanpa server error 5xx, dan mekanisme rate limiting berhasil disimulasikan melalui status 429. Hasil ini menunjukkan pipeline automation, monitoring, report generation, dan email notification sudah berjalan sesuai rancangan.'
    : 'Pengujian performance selesai, namun terdapat metrik yang perlu ditinjau lebih lanjut. Tim perlu memeriksa response time, error 5xx, dan log server sebelum workflow digunakan untuk target production.';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Laporan Pekerjaan MS Hosted PBX</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    body { font-family: Arial, sans-serif; color: #222; line-height: 1.45; }
    .cover { text-align: center; margin-top: 120px; }
    .brand { font-size: 20px; letter-spacing: 1px; color: #555; margin-bottom: 80px; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; border-bottom: 1px solid #333; padding-bottom: 5px; margin-top: 24px; }
    h3 { font-size: 15px; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; }
    th, td { border: 1px solid #999; padding: 7px; font-size: 11px; vertical-align: top; }
    th { background: #f1f1f1; }
    .page-break { page-break-before: always; }
    .muted { color: #666; }
    .ok { color: #0a7a28; font-weight: bold; }
    .warn { color: #a06a00; font-weight: bold; }
    .risk { color: #b00020; font-weight: bold; }
    pre { white-space: pre-wrap; background: #f7f7f7; border: 1px solid #ddd; padding: 10px; font-size: 9px; max-height: 520px; overflow: hidden; }
    ul { margin-top: 5px; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand">PT. Salam Solusi Nusantara</div>
    <h1>Laporan Pekerjaan MS Hosted PBX</h1>
    <h2 style="border:0;">Managed Service Pemeliharaan Hosted PBX</h2>
    <p>Periode: ${escapeHtml(monthLabel(month))}</p>
    <p class="muted">Generated: ${escapeHtml(runDate)}</p>
  </section>

  <section class="page-break">
    <h2>Daftar Revisi</h2>
    <table>
      <tr><th>Versi</th><th>Deskripsi</th><th>Tanggal</th><th>Author</th></tr>
      <tr><td>1.0</td><td>Pembuatan laporan otomatis performance test</td><td>${escapeHtml(month)}</td><td>QA Automation</td></tr>
    </table>

    <h2>Daftar Isi</h2>
    <ol>
      <li>Log Activity</li>
      <li>Lampiran ${escapeHtml(monthLabel(month))}</li>
      <li>Monitoring Resource CPU & RAM</li>
      <li>Monitoring Storage Disk</li>
      <li>Optimasi Storage Disk</li>
      <li>Load Test via k6</li>
      <li>Insight dan Rekomendasi</li>
      <li>Kesimpulan</li>
    </ol>
  </section>

  <section class="page-break">
    <h2>Log Activity</h2>
    <table>
      <tr><th>Kegiatan</th><th>Status</th></tr>
      <tr><td>Monitoring resource CPU & RAM server testing</td><td class="ok">DONE</td></tr>
      <tr><td>Monitoring storage disk server testing</td><td class="ok">DONE</td></tr>
      <tr><td>Optimasi storage disk server testing</td><td class="ok">DONE</td></tr>
      <tr><td>Load Test via k6</td><td class="ok">DONE</td></tr>
      <tr><td>Generate PDF report</td><td class="ok">DONE</td></tr>
      <tr><td>Email notification</td><td class="ok">DONE jika workflow sukses</td></tr>
    </table>
  </section>

  <section class="page-break">
    <h2>Lampiran - ${escapeHtml(monthLabel(month))}</h2>

    <h3>1. Monitoring Resource CPU & RAM</h3>
    <pre>${escapeHtml(readFileSafe(cpuRamPath))}</pre>

    <h3>2. Monitoring Storage Disk</h3>
    <pre>${escapeHtml(readFileSafe(storagePath))}</pre>

    <h3>3. Optimasi Storage Disk</h3>
    <pre>${escapeHtml(readFileSafe(optimizePath))}</pre>
  </section>

  <section class="page-break">
    <h2>4. Load Test via K6</h2>
    <h3>Stress Test</h3>

    <h3>Overview</h3>
    <ul>
      <li>Test Name: Stress Test</li>
      <li>Environment: Testing Server / Dummy Website</li>
      <li>Tool Used: k6</li>
      <li>API Tested: /api/login</li>
      <li>Target Load: 0 → 100 → 200 → 300 → 0 VUs dalam ±23 menit</li>
    </ul>

    <h3>Tujuan Pengujian</h3>
    <ul>
      <li>Memastikan workflow otomasi bulanan berjalan end-to-end.</li>
      <li>Mengukur response time dummy API pada skenario stress test.</li>
      <li>Memvalidasi pencatatan status 200, 429, dan 5xx.</li>
      <li>Memastikan HTML report, PDF report, artifact, dan email notification berhasil dibuat.</li>
    </ul>

    <h3>Hasil Pengujian</h3>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Virtual Users (VUs)</td><td>${metric(summary, 'vus_max', 'max')} VUs</td></tr>
      <tr><td>Total HTTP Requests</td><td>${totalRequests}</td></tr>
      <tr><td>Requests per Second</td><td>${Number(rps).toFixed(2)} req/s</td></tr>
      <tr><td>HTTP Success Rate</td><td>${pct(1 - failureRate)}</td></tr>
      <tr><td>HTTP Failure Rate</td><td>${pct(failureRate)}</td></tr>
      <tr><td>Status 200</td><td>${status200}</td></tr>
      <tr><td>Status 429 Rate Limited</td><td>${status429}</td></tr>
      <tr><td>Status 5xx Server Error</td><td>${status5xx}</td></tr>
      <tr><td>Average Response Time</td><td>${Math.round(avgResponse)} ms</td></tr>
      <tr><td>P95 Response Time</td><td>${Math.round(p95)} ms</td></tr>
      <tr><td>Max Response Time</td><td>${Math.round(maxResponse)} ms</td></tr>
      <tr><td>Data Received</td><td>${mb(metric(summary, 'data_received', 'count'))}</td></tr>
      <tr><td>Data Sent</td><td>${mb(metric(summary, 'data_sent', 'count'))}</td></tr>
      <tr><td>Avg Connection Time</td><td>${Math.round(metric(summary, 'http_req_connecting', 'avg'))} ms</td></tr>
      <tr><td>Avg TLS Handshake</td><td>${Math.round(metric(summary, 'http_req_tls_handshaking', 'avg'))} ms</td></tr>
      <tr><td>Avg Waiting Time</td><td>${Math.round(metric(summary, 'http_req_waiting', 'avg'))} ms</td></tr>
    </table>

    <h3>Insight dan Rekomendasi</h3>
    <table>
      <tr><th>Area</th><th>Status</th><th>Action</th></tr>
      <tr><td>Server Stability</td><td>${escapeHtml(stabilityStatus)}</td><td>${status5xx === 0 ? 'Tidak ada tindakan khusus.' : 'Periksa log aplikasi dan resource server.'}</td></tr>
      <tr><td>Latency</td><td>${escapeHtml(latencyStatus)}</td><td>${p95 < 6000 ? 'Tidak perlu optimasi pada dummy environment.' : 'Investigasi bottleneck aplikasi/server.'}</td></tr>
      <tr><td>Rate Limiting</td><td>${escapeHtml(rateLimitStatus)}</td><td>Status 429 pada dummy API adalah expected behavior untuk simulasi proteksi login.</td></tr>
      <tr><td>Automation Pipeline</td><td>Berjalan</td><td>Gunakan hasil ini sebagai baseline sebelum diarahkan ke production.</td></tr>
    </table>

    <h3>Kesimpulan</h3>
    <p>${escapeHtml(conclusion)}</p>
  </section>
</body>
</html>`;

  const tempHtml = path.join(path.dirname(output), 'laporan-pekerjaan-ms-pbx.html');
  fs.writeFileSync(tempHtml, html);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${path.resolve(tempHtml)}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: output,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }

  console.log(`Final report generated: ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
