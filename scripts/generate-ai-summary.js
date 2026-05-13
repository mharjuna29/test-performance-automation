const fs = require("fs");

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function getMetric(summary, metricName, valueName, fallback = 0) {
  const value = summary?.metrics?.[metricName]?.values?.[valueName];
  return value === undefined || value === null ? fallback : Number(value);
}

function normalizeRate(value) {
  const number = Number(value || 0);
  return number > 1 ? number / 100 : number;
}

function buildMetrics(summary) {
  const totalRequests = getMetric(summary, "http_reqs", "count", 0);
  const failureRate = normalizeRate(getMetric(summary, "http_req_failed", "rate", 0));
  const successRate = 1 - failureRate;

  return {
    total_vus: getMetric(summary, "vus_max", "max", 0),
    total_http_requests: totalRequests,
    requests_per_second: Math.round(getMetric(summary, "http_reqs", "rate", 0)),
    http_success_rate_percent: Math.round(successRate * 100),
    http_failure_rate_percent: Math.round(failureRate * 100),
    status_200: getMetric(summary, "status_200", "count", 0),
    status_429: getMetric(summary, "status_429", "count", 0),
    status_5xx: getMetric(summary, "status_500", "count", 0),
    status_other: getMetric(summary, "status_other", "count", 0),
    avg_response_time_ms: Math.round(getMetric(summary, "http_req_duration", "avg", 0)),
    p95_response_time_ms: Math.round(getMetric(summary, "http_req_duration", "p(95)", 0)),
    max_response_time_ms: Math.round(getMetric(summary, "http_req_duration", "max", 0)),
    data_received_mb: Number((getMetric(summary, "data_received", "count", 0) / 1024 / 1024).toFixed(2)),
    data_sent_mb: Number((getMetric(summary, "data_sent", "count", 0) / 1024 / 1024).toFixed(2)),
    avg_connection_time_ms: Math.round(getMetric(summary, "http_req_connecting", "avg", 0)),
    avg_tls_handshake_ms: Math.round(getMetric(summary, "http_req_tls_handshaking", "avg", 0)),
    avg_waiting_time_ms: Math.round(getMetric(summary, "http_req_waiting", "avg", 0)),
  };
}

function stripJsonFence(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function fallbackSummary(metrics, reason) {
  const failureRate = metrics.http_failure_rate_percent;
  const p95 = metrics.p95_response_time_ms;

  return {
    executive_summary:
      `AI summary tidak tersedia. Laporan menggunakan fallback rule-based. Total request ${metrics.total_http_requests}, success rate ${metrics.http_success_rate_percent}%, failure rate ${failureRate}%, dan P95 response time ${p95} ms.`,
    insights: [
      {
        area: "AI Summary",
        status: "Fallback",
        finding: `Qwen API gagal atau tidak mengembalikan JSON valid. Reason: ${reason}`,
        recommendation: "Periksa DASHSCOPE_API_KEY, QWEN_BASE_URL, QWEN_MODEL, dan response API di GitHub Actions log.",
      },
      {
        area: "Latency",
        status: p95 < 1000 ? "Sangat Baik" : p95 < 3000 ? "Normal" : p95 < 6000 ? "Perlu Dipantau" : "Melebihi Threshold",
        finding: `P95 response time tercatat ${p95} ms.`,
        recommendation: p95 < 6000 ? "Latency masih berada dalam batas threshold." : "Perlu investigasi bottleneck aplikasi, jaringan, atau server.",
      },
      {
        area: "Status Code Breakdown",
        status:
          metrics.total_http_requests > 0 &&
          metrics.status_200 === 0 &&
          metrics.status_429 === 0 &&
          metrics.status_5xx === 0 &&
          metrics.status_other === 0
            ? "Tidak Lengkap"
            : "Tercatat",
        finding:
          metrics.total_http_requests > 0 &&
          metrics.status_200 === 0 &&
          metrics.status_429 === 0 &&
          metrics.status_5xx === 0 &&
          metrics.status_other === 0
            ? "Total request tercatat, tetapi seluruh breakdown status code masih 0."
            : "Breakdown status code tersedia.",
        recommendation: "Validasi custom counter status_200, status_429, status_500, dan status_other pada script k6.",
      },
    ],
    risk_notes: [
      "AI summary gagal dibuat, sehingga report memakai fallback rule-based.",
      "Jika status code breakdown bernilai 0 sementara request dan failure rate terisi, klasifikasi failure belum akurat.",
    ],
    conclusion:
      `Pengujian performance selesai dengan ${metrics.total_http_requests} request dan ${metrics.total_vus} VUs. P95 response time sebesar ${p95} ms. Failure rate tercatat ${failureRate}%. Hasil ini dapat digunakan sebagai baseline automation, namun klasifikasi status code perlu dipastikan agar analisis failure lebih akurat.`,
  };
}

async function main() {
  const summaryPath = getArg("summary");
  const outputPath = getArg("output");

  if (!summaryPath || !outputPath) {
    console.error("Missing required args: --summary, --output");
    process.exit(1);
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL || "qwen-plus";

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const metrics = buildMetrics(summary);

  if (!apiKey) {
    console.warn("Missing DASHSCOPE_API_KEY. Writing fallback AI summary.");
    fs.writeFileSync(outputPath, JSON.stringify(fallbackSummary(metrics, "Missing DASHSCOPE_API_KEY"), null, 2));
    return;
  }

  const systemPrompt = `
Anda adalah Senior Software Quality Assurance Engineer dengan pengalaman performance testing.

Tugas Anda:
Membuat analisis hasil performance test k6 secara objektif, ringkas, dan berbasis data.

Aturan:
- Jangan mengarang angka.
- Semua insight harus berdasarkan data metrics yang diberikan.
- Jika status 200, 429, 5xx, dan other bernilai 0 tetapi total request lebih dari 0, nyatakan sebagai anomali pencatatan status code.
- Jika status 429 = 0, jangan menyimpulkan rate limiting aktif.
- Jika failure rate tinggi tetapi status 429 = 0, sebutkan bahwa penyebab failure belum terklasifikasi.
- Jika P95 < 1000 ms, latency sangat baik.
- Jika P95 1000-3000 ms, latency normal.
- Jika P95 3000-6000 ms, latency perlu dipantau.
- Jika P95 > 6000 ms, latency melewati threshold.
- Jika status 5xx = 0, sistem stabil dari sisi server error.
- Gunakan Bahasa Indonesia formal.
- Persentase tidak perlu decimal.
- Output harus JSON valid saja, tanpa markdown, tanpa code fence.
`;

  const userPrompt = `
Buat executive summary, insight dan rekomendasi, risk notes, dan kesimpulan untuk laporan performance test berikut.

Format output harus persis JSON seperti ini:
{
  "executive_summary": "string",
  "insights": [
    {
      "area": "string",
      "status": "string",
      "finding": "string",
      "recommendation": "string"
    }
  ],
  "risk_notes": ["string"],
  "conclusion": "string"
}

Data metrics:
${JSON.stringify(metrics, null, 2)}
`;

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Qwen API error:", errorText);

    fs.writeFileSync(
      outputPath,
      JSON.stringify(fallbackSummary(metrics, `Qwen API error: ${response.status}`), null, 2)
    );

    console.log(`Fallback AI summary generated: ${outputPath}`);
    return;
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;

  if (!content) {
    console.error("Qwen response does not contain choices[0].message.content");
    console.error(JSON.stringify(result, null, 2));

    fs.writeFileSync(
      outputPath,
      JSON.stringify(fallbackSummary(metrics, "Empty Qwen response content"), null, 2)
    );

    console.log(`Fallback AI summary generated: ${outputPath}`);
    return;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(content));
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
    console.log(`Qwen AI summary generated: ${outputPath}`);
  } catch (error) {
    console.error("Failed to parse Qwen JSON response:");
    console.error(content);

    fs.writeFileSync(
      outputPath,
      JSON.stringify(fallbackSummary(metrics, "Invalid JSON from Qwen"), null, 2)
    );

    console.log(`Fallback AI summary generated: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});