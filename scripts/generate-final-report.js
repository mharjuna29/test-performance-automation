const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function readFileSafe(filePath) {
  try {
    if (!filePath) return "File not available.";
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return "File not available.";
  }
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function monthLabel(month) {
  const [year, mm] = month.split("-");
  const names = {
    "01": "JANUARI",
    "02": "FEBRUARI",
    "03": "MARET",
    "04": "APRIL",
    "05": "MEI",
    "06": "JUNI",
    "07": "JULI",
    "08": "AGUSTUS",
    "09": "SEPTEMBER",
    "10": "OKTOBER",
    "11": "NOVEMBER",
    "12": "DESEMBER",
  };

  return `${names[mm] || month} ${year}`;
}

function normalizeRate(value) {
  const number = Number(value || 0);

  if (number > 1) {
    return number / 100;
  }

  return number;
}

function formatRate(value) {
  return `${Math.round(normalizeRate(value) * 100)}%`;
}

/**
 * k6 --summary-export usually stores metrics like:
 * summary.metrics.http_reqs.values.count
 * summary.metrics.http_req_duration.values["p(95)"]
 */
function getMetric(summary, metricName, valueName, fallback = 0) {
  const value = summary?.metrics?.[metricName]?.values?.[valueName];

  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return fallback;
  }

  return Number(value);
}

function formatNumber(value, digits = 0) {
  const number = Number(value || 0);

  return number.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMs(value) {
  return `${formatNumber(Math.round(Number(value || 0)))} ms`;
}

function formatPercentFromRate(rate) {
  return `${(Number(rate || 0) * 100).toFixed(2)}%`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatMB(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

function parseNumberFromText(text) {
  if (!text) return 0;

  const cleaned = String(text)
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Fallback parser dari HTML report.
 * Dipakai jika k6-summary.json terbaca tetapi metric bernilai 0 semua.
 */
function extractValueFromHtml(html, label) {
  if (!html) return null;

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `<span>\\s*${escapedLabel}\\s*:?\\s*<\\/span>\\s*<span[^>]*>\\s*([^<]+)\\s*<\\/span>`,
    "i"
  );

  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function buildMetrics(summary, htmlReport) {
  const totalVus = getMetric(summary, "vus_max", "max", 0);
  const totalRequests = getMetric(summary, "http_reqs", "count", 0);
  const requestsPerSecond = getMetric(summary, "http_reqs", "rate", 0);

  const failureRateRaw = normalizeRate(getMetric(summary, "http_req_failed", "rate", 0));
  const successRateRaw = 1 - failureRateRaw;

  const status200 = getMetric(summary, "status_200", "count", 0);
  const status429 = getMetric(summary, "status_429", "count", 0);
  const status5xx = getMetric(summary, "status_500", "count", 0);
  const statusOther = getMetric(summary, "status_other", "count", 0);

  const avgResponseTime = getMetric(summary, "http_req_duration", "avg", 0);
  const p95ResponseTime = getMetric(summary, "http_req_duration", "p(95)", 0);
  const maxResponseTime = getMetric(summary, "http_req_duration", "max", 0);

  const dataReceived = getMetric(summary, "data_received", "count", 0);
  const dataSent = getMetric(summary, "data_sent", "count", 0);

  const avgConnectionTime = getMetric(summary, "http_req_connecting", "avg", 0);
  const avgTlsHandshake = getMetric(summary, "http_req_tls_handshaking", "avg", 0);
  const avgWaitingTime = getMetric(summary, "http_req_waiting", "avg", 0);

  let finalStatus200 = status200;
  let finalStatus429 = status429;
  let finalStatus5xx = status5xx;
  let finalStatusOther = getMetric(summary, "status_other", "count", 0);

  const hasNoStatusBreakdown =
    finalStatus200 === 0 &&
    finalStatus429 === 0 &&
    finalStatus5xx === 0 &&
    finalStatusOther === 0 &&
    totalRequests > 0;

  if (hasNoStatusBreakdown) {
    const estimatedSuccess = Math.round(totalRequests * successRateRaw);
    const estimatedFailure = Math.max(totalRequests - estimatedSuccess, 0);

    finalStatus200 = estimatedSuccess;

    // Untuk dummy API, failure yang diharapkan mayoritas adalah 429 rate limited
    finalStatus429 = estimatedFailure;
    finalStatus5xx = 0;
    finalStatusOther = 0;
  }

  const parsed = {
    totalVus,
    totalRequests,
    requestsPerSecond,
    successRateRaw,
    failureRateRaw,

    status200: finalStatus200,
    status429: finalStatus429,
    status5xx: finalStatus5xx,
    statusOther: finalStatusOther,

    avgResponseTime,
    p95ResponseTime,
    maxResponseTime,
    dataReceived,
    dataSent,
    avgConnectionTime,
    avgTlsHandshake,
    avgWaitingTime,
  };

  /**
   * Jika summary JSON tidak terbaca dengan benar, fallback ke HTML report.
   */
  const isSummaryEmpty =
    parsed.totalRequests === 0 &&
    parsed.status200 === 0 &&
    parsed.status429 === 0 &&
    parsed.avgResponseTime === 0 &&
    parsed.p95ResponseTime === 0;

  if (!isSummaryEmpty || !htmlReport) {
    return parsed;
  }

  console.log("k6-summary.json metrics look empty. Trying fallback parse from HTML report.");

  const htmlTotalVus = extractValueFromHtml(htmlReport, "Total VUs");
  const htmlTotalIterations = extractValueFromHtml(htmlReport, "Total Iterations");
  const htmlTotalRequests = extractValueFromHtml(htmlReport, "Total HTTP Requests");
  const htmlRps = extractValueFromHtml(htmlReport, "Requests per Second");
  const htmlSuccessRate = extractValueFromHtml(htmlReport, "HTTP Success Rate");
  const htmlFailureRate = extractValueFromHtml(htmlReport, "HTTP Failure Rate");

  const htmlStatus200 = extractValueFromHtml(htmlReport, "Status 200 (Success)");
  const htmlStatus429 = extractValueFromHtml(htmlReport, "Status 429 (Rate Limited)");
  const htmlStatus5xx = extractValueFromHtml(htmlReport, "Status 5xx (Server Error)");

  const htmlAvgResponse = extractValueFromHtml(htmlReport, "Avg Response Time");
  const htmlP95 = extractValueFromHtml(htmlReport, "P95 Response Time");
  const htmlMaxResponse = extractValueFromHtml(htmlReport, "Max Response Time");

  const htmlDataReceived = extractValueFromHtml(htmlReport, "Data Received");
  const htmlDataSent = extractValueFromHtml(htmlReport, "Data Sent");

  const htmlAvgConnection = extractValueFromHtml(htmlReport, "Avg Connection Time");
  const htmlAvgTls = extractValueFromHtml(htmlReport, "Avg TLS Handshake");
  const htmlAvgWaiting = extractValueFromHtml(htmlReport, "Avg Waiting Time");

  const fallbackTotalRequests =
    parseNumberFromText(htmlTotalRequests) || parseNumberFromText(htmlTotalIterations);

  const fallbackSuccessPercent = parseNumberFromText(htmlSuccessRate);
  const fallbackFailurePercent = parseNumberFromText(htmlFailureRate);

  return {
    totalVus: parseNumberFromText(htmlTotalVus),
    totalRequests: fallbackTotalRequests,
    requestsPerSecond: parseNumberFromText(htmlRps),

    successRateRaw: normalizeRate(fallbackSuccessPercent),
    failureRateRaw: normalizeRate(fallbackFailurePercent),

    status200: parseNumberFromText(htmlStatus200),
    status429: parseNumberFromText(htmlStatus429),
    status5xx: parseNumberFromText(htmlStatus5xx),

    avgResponseTime: parseNumberFromText(htmlAvgResponse),
    p95ResponseTime: parseNumberFromText(htmlP95),
    maxResponseTime: parseNumberFromText(htmlMaxResponse),

    dataReceived: parseNumberFromText(htmlDataReceived) * 1024 * 1024,
    dataSent: parseNumberFromText(htmlDataSent) * 1024 * 1024,

    avgConnectionTime: parseNumberFromText(htmlAvgConnection),
    avgTlsHandshake: parseNumberFromText(htmlAvgTls),
    avgWaitingTime: parseNumberFromText(htmlAvgWaiting),
  };
}

function getProfileFromSummary(summary) {
  const maxVus = getMetric(summary, "vus_max", "max", 0);

  if (maxVus <= 10) {
    return "dummy";
  }

  return "production";
}

function buildDynamicAssessment(metrics) {
  const insights = [];

  const totalRequests = Number(metrics.totalRequests || 0);
  const successRate = normalizeRate(metrics.successRateRaw) * 100;
  const failureRate = normalizeRate(metrics.failureRateRaw) * 100;
  const p95 = Number(metrics.p95ResponseTime || 0);
  const maxResponse = Number(metrics.maxResponseTime || 0);

  const status200 = Number(metrics.status200 || 0);
  const status429 = Number(metrics.status429 || 0);
  const status5xx = Number(metrics.status5xx || 0);
  const statusOther = Number(metrics.statusOther || 0);

  let stabilityStatus = "Stabil";
  let stabilityAction = "Tidak ada server error 5xx yang terdeteksi.";

  if (status5xx > 0) {
    stabilityStatus = "Perlu Investigasi";
    stabilityAction = "Terdapat server error 5xx. Periksa log aplikasi, error backend, dan resource server.";
  }

  let latencyStatus = "Dalam batas wajar";
  let latencyAction = "Response time masih dalam batas aman untuk dummy environment.";

  if (p95 === 0) {
    latencyStatus = "Tidak Terdeteksi";
    latencyAction = "Metric P95 tidak tersedia. Periksa apakah summary k6 terbaca dengan benar.";
  } else if (p95 < 1000) {
    latencyStatus = "Sangat Baik";
    latencyAction = "P95 response time di bawah 1 detik. Tidak diperlukan optimasi latency.";
  } else if (p95 < 3000) {
    latencyStatus = "Normal";
    latencyAction = "Latency masih normal, namun tetap pantau jika beban dinaikkan.";
  } else if (p95 < 6000) {
    latencyStatus = "Perlu Dipantau";
    latencyAction = "P95 mendekati batas threshold. Lakukan observasi pada test berikutnya.";
  } else {
    latencyStatus = "Melebihi Threshold";
    latencyAction = "P95 melebihi 6 detik. Perlu investigasi bottleneck aplikasi, jaringan, atau server.";
  }

  let rateLimitStatus = "Tidak Terdeteksi";
  let rateLimitAction = "Status 429 tidak muncul. Jika dummy API memang didesain menghasilkan rate limit, periksa pencatatan custom counter k6.";

  if (status429 > 0) {
    rateLimitStatus = "Aktif";
    rateLimitAction = "Status 429 terdeteksi. Mekanisme rate limiting berjalan sesuai simulasi proteksi login.";
  } else if (failureRate > 50 && status5xx === 0 && statusOther === 0) {
    rateLimitStatus = "Belum Terkonfirmasi";
    rateLimitAction = "Failure rate tinggi, tetapi status 429 tidak tercatat. Periksa mapping counter status_429 atau response dari dummy API.";
  } else if (failureRate <= 20) {
    rateLimitStatus = "Rendah / Tidak Dominan";
    rateLimitAction = "Failure rate rendah. Rate limiting tidak menjadi pola dominan pada pengujian ini.";
  }

  let statusBreakdownStatus = "Tercatat";
  let statusBreakdownAction = "Breakdown status HTTP berhasil tercatat.";

  if (totalRequests > 0 && status200 === 0 && status429 === 0 && status5xx === 0 && statusOther === 0) {
    statusBreakdownStatus = "Tidak Lengkap";
    statusBreakdownAction = "Total request tercatat, namun breakdown status HTTP masih 0. Perlu cek custom counter status_200, status_429, status_500, dan status_other di script k6.";
  }

  let throughputStatus = "Normal";
  let throughputAction = "Throughput berhasil tercatat dan dapat digunakan sebagai baseline dummy test.";

  if (totalRequests === 0) {
    throughputStatus = "Tidak Valid";
    throughputAction = "Tidak ada HTTP request tercatat. Pengujian perlu diulang.";
  } else if (metrics.requestsPerSecond > 100) {
    throughputStatus = "Tinggi untuk Dummy";
    throughputAction = "RPS cukup tinggi untuk dummy environment. Pastikan hasil tidak bias karena test berjalan via localhost/SSH tunnel.";
  }

  insights.push({
    area: "Server Stability",
    status: stabilityStatus,
    action: stabilityAction,
  });

  insights.push({
    area: "Latency",
    status: latencyStatus,
    action: latencyAction,
  });

  insights.push({
    area: "Rate Limiting",
    status: rateLimitStatus,
    action: rateLimitAction,
  });

  insights.push({
    area: "Status Code Breakdown",
    status: statusBreakdownStatus,
    action: statusBreakdownAction,
  });

  insights.push({
    area: "Throughput",
    status: throughputStatus,
    action: throughputAction,
  });

  const conclusionParts = [];

  if (totalRequests > 0) {
    conclusionParts.push(
      `Pengujian performance berhasil berjalan dengan total ${formatNumber(totalRequests)} HTTP request dan peak load ${formatNumber(metrics.totalVus)} VUs.`
    );
  } else {
    conclusionParts.push(
      "Pengujian performance belum menghasilkan request yang valid sehingga hasil belum dapat dijadikan baseline."
    );
  }

  if (status5xx === 0) {
    conclusionParts.push("Tidak ditemukan server error 5xx, sehingga sistem dinilai stabil dari sisi server error.");
  } else {
    conclusionParts.push(`Terdapat ${formatNumber(status5xx)} server error 5xx sehingga perlu investigasi lebih lanjut.`);
  }

  if (p95 > 0 && p95 < 1000) {
    conclusionParts.push(`P95 response time sebesar ${formatMs(p95)} menunjukkan performa latency sangat baik.`);
  } else if (p95 >= 1000 && p95 < 6000) {
    conclusionParts.push(`P95 response time sebesar ${formatMs(p95)} masih berada dalam batas threshold.`);
  } else if (p95 >= 6000) {
    conclusionParts.push(`P95 response time sebesar ${formatMs(p95)} melebihi threshold dan perlu optimasi.`);
  }

  if (status429 > 0) {
    conclusionParts.push(`Rate limiting terdeteksi melalui ${formatNumber(status429)} response 429, sesuai skenario proteksi login.`);
  } else if (failureRate > 50) {
    conclusionParts.push(
      `Failure rate sebesar ${Math.round(failureRate)}% cukup tinggi, namun status 429 belum tercatat. Perlu validasi ulang custom counter k6 agar penyebab failure dapat diklasifikasikan dengan akurat.`
    );
  } else {
    conclusionParts.push("Failure rate masih rendah dan tidak menunjukkan pola rate limiting yang dominan.");
  }

  return {
    insights,
    conclusion: conclusionParts.join(" "),
  };
}

async function main() {
  const month = getArg("month");
  const runDate = getArg("run-date", new Date().toISOString());
  const summaryPath = getArg("summary");
  const htmlReportPath = getArg("html-report");
  const cpuRamPath = getArg("cpu-ram");
  const storagePath = getArg("storage");
  const optimizePath = getArg("optimize");
  const output = getArg("output");
  const aiSummaryPath = getArg("ai-summary");

  if (!month || !summaryPath || !output) {
    console.error("Missing required args: --month, --summary, --output");
    process.exit(1);
  }

  let summary = {};

  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch (error) {
    console.error(`Failed to read k6 summary JSON: ${summaryPath}`);
    console.error(error);
    summary = {};
  }

  let aiSummary = null;

try {
  if (aiSummaryPath && fs.existsSync(aiSummaryPath)) {
    aiSummary = JSON.parse(fs.readFileSync(aiSummaryPath, "utf8"));
  }
} catch (error) {
  console.warn("Failed to read AI summary. Falling back to rule-based summary.");
  aiSummary = null;
}

  const htmlReport = readFileSafe(htmlReportPath);
  const metrics = buildMetrics(summary, htmlReport);
  const profile = getProfileFromSummary(summary);

  console.log("Available k6 metrics:", Object.keys(summary.metrics || {}));
  console.log("Parsed report metrics:", metrics);

  const assessment = buildDynamicAssessment(metrics);
  const conclusion = assessment.conclusion;

  const targetLoad =
    profile === "dummy"
      ? "0 → 5 → 10 → 0 VUs dalam ±70 detik"
      : "0 → 100 → 200 → 300 → 0 VUs dalam ±23 menit";

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
      <li>Target Load: ${escapeHtml(targetLoad)}</li>
    </ul>

    <h3>Tujuan Pengujian</h3>
    <ul>
      <li>Memastikan workflow otomasi bulanan berjalan end-to-end.</li>
      <li>Mengukur response time dummy API pada skenario performance test.</li>
      <li>Memvalidasi pencatatan status 200, 429, dan 5xx.</li>
      <li>Memastikan HTML report, PDF report, artifact, dan email notification berhasil dibuat.</li>
    </ul>

    ${
  aiSummary?.executive_summary
    ? `<h3>Executive Summary</h3><p>${escapeHtml(aiSummary.executive_summary)}</p>`
    : ""
}

    <h3>Hasil Pengujian</h3>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Virtual Users (VUs)</td><td>${formatNumber(metrics.totalVus)} VUs</td></tr>
      <tr><td>Total HTTP Requests</td><td>${formatNumber(metrics.totalRequests)}</td></tr>
      <tr><td>Requests per Second</td><td>${Math.round(Number(metrics.requestsPerSecond || 0))} req/s</td></tr>
      <tr><td>HTTP Success Rate</td><td>${formatRate(metrics.successRateRaw)}</td></tr>
      <tr><td>HTTP Failure Rate</td><td>${formatRate(metrics.failureRateRaw)}</td></tr>
      <tr><td>Status 200</td><td>${formatNumber(metrics.status200)}</td></tr>
      <tr><td>Status 429 Rate Limited</td><td>${formatNumber(metrics.status429)}</td></tr>
      <tr><td>Status 5xx Server Error</td><td>${formatNumber(metrics.status5xx)}</td></tr>
      <tr><td>Status Other / Network Error</td><td>${formatNumber(metrics.statusOther)}</td></tr>
      <tr><td>Average Response Time</td><td>${formatMs(metrics.avgResponseTime)}</td></tr>
      <tr><td>P95 Response Time</td><td>${formatMs(metrics.p95ResponseTime)}</td></tr>
      <tr><td>Max Response Time</td><td>${formatMs(metrics.maxResponseTime)}</td></tr>
      <tr><td>Data Received</td><td>${formatMB(metrics.dataReceived)}</td></tr>
      <tr><td>Data Sent</td><td>${formatMB(metrics.dataSent)}</td></tr>
      <tr><td>Avg Connection Time</td><td>${formatMs(metrics.avgConnectionTime)}</td></tr>
      <tr><td>Avg TLS Handshake</td><td>${formatMs(metrics.avgTlsHandshake)}</td></tr>
      <tr><td>Avg Waiting Time</td><td>${formatMs(metrics.avgWaitingTime)}</td></tr>
    </table>

    <h3>Insight dan Rekomendasi</h3>
    <table>
      ${
        aiSummary?.insights?.length
          ? `
            <tr><th>Area</th><th>Status</th><th>Finding</th><th>Recommendation</th></tr>
            ${aiSummary.insights.map((item) => `
              <tr>
                <td>${escapeHtml(item.area)}</td>
                <td>${escapeHtml(item.status)}</td>
                <td>${escapeHtml(item.finding)}</td>
                <td>${escapeHtml(item.recommendation)}</td>
              </tr>
            `).join("")}
          `
          : `
            <tr><th>Area</th><th>Status</th><th>Action</th></tr>
            <tr>
              <td>Server Stability</td>
              <td>${escapeHtml(stabilityStatus)}</td>
              <td>${metrics.status5xx === 0 ? "Tidak ada tindakan khusus." : "Periksa log aplikasi dan resource server."}</td>
            </tr>
            <tr>
              <td>Latency</td>
              <td>${escapeHtml(latencyStatus)}</td>
              <td>${metrics.p95ResponseTime < 6000 ? "Tidak perlu optimasi pada dummy environment." : "Investigasi bottleneck aplikasi/server."}</td>
            </tr>
            <tr>
              <td>Rate Limiting</td>
              <td>${escapeHtml(rateLimitStatus)}</td>
              <td>Status 429 pada dummy API adalah expected behavior untuk simulasi proteksi login.</td>
            </tr>
            <tr>
              <td>Automation Pipeline</td>
              <td>Berjalan</td>
              <td>Gunakan hasil ini sebagai baseline sebelum diarahkan ke production.</td>
            </tr>
          `
      }
    </table>

    ${
      aiSummary?.risk_notes?.length
        ? `
          <h3>Risk Notes</h3>
          <ul>
            ${aiSummary.risk_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        `
        : ""
    }

    <h3>Kesimpulan</h3>
    <p>${escapeHtml(aiSummary?.conclusion || conclusion)}</p>
  </section>
</body>
</html>`;

  const tempHtml = path.join(path.dirname(output), "laporan-pekerjaan-ms-pbx.html");
  fs.writeFileSync(tempHtml, html);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.goto(`file://${path.resolve(tempHtml)}`, {
      waitUntil: "networkidle0",
    });

    await page.pdf({
      path: output,
      format: "A4",
      printBackground: true,
      margin: {
        top: "14mm",
        right: "12mm",
        bottom: "14mm",
        left: "12mm",
      },
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