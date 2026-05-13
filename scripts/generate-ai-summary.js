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

async function main() {
  const summaryPath = getArg("summary");
  const outputPath = getArg("output");

  if (!summaryPath || !outputPath) {
    console.error("Missing required args: --summary, --output");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const metrics = buildMetrics(summary);

  /**
   * PROMPT AI DI SINI
   * Ubah bagian ini jika ingin mengatur gaya analisis, aturan threshold,
   * atau format bahasa laporan.
   */
  const systemPrompt = `
Anda adalah Senior Software Quality Assurance Engineer dengan pengalaman performance testing.
Tugas Anda adalah membuat analisis hasil performance test k6 secara objektif, ringkas, dan berbasis data.

Aturan penting:
- Jangan mengarang angka.
- Semua insight harus berdasarkan data yang diberikan.
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
- Output harus berupa JSON valid.
`;

  const userPrompt = `
Buat executive summary, insight dan rekomendasi, risk notes, dan kesimpulan untuk laporan performance test berikut.

Data metrics:
${JSON.stringify(metrics, null, 2)}
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "performance_test_ai_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              executive_summary: {
                type: "string",
              },
              insights: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    area: { type: "string" },
                    status: { type: "string" },
                    finding: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["area", "status", "finding", "recommendation"],
                },
              },
              risk_notes: {
                type: "array",
                items: { type: "string" },
              },
              conclusion: {
                type: "string",
              },
            },
            required: ["executive_summary", "insights", "risk_notes", "conclusion"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", errorText);
    process.exit(1);
  }

  const result = await response.json();

  const outputText = result.output_text;

  if (!outputText) {
    console.error("AI response does not contain output_text");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  fs.writeFileSync(outputPath, outputText);
  console.log(`AI summary generated: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});