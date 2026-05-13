# PBX Performance Test Automation

This project provides an automated performance testing workflow for the Hosted PBX service. It is designed to run scheduled k6 performance tests, collect server monitoring data, generate HTML and PDF reports, and optionally enrich the final report with AI-generated insights and recommendations.

The main goal of this project is to reduce manual effort in monthly performance validation while keeping the report output consistent, traceable, and easy to review.

---

## Overview

The automation is built around GitHub Actions and is intended to run during the first week of every month. The workflow connects to a testing server through SSH, deploys a dummy API application, runs a k6 performance test against the dummy endpoint, collects monitoring data, generates test reports, and sends an email notification when the process is completed.

The generated report follows the structure of an operational maintenance report, including:

- Activity log
- CPU and RAM monitoring
- Storage monitoring
- Storage optimization result
- k6 performance test result
- Insight and recommendation
- Final conclusion

---

## Key Features

### 1. Scheduled Monthly Execution

The workflow is configured to run automatically during the first week of every month. It can also be triggered manually from the GitHub Actions page for testing or troubleshooting purposes.

### 2. SSH-Based Testing Server Integration

The workflow connects to a remote testing server using SSH. This allows the automation to:

- Deploy or update the dummy API
- Start the dummy API service
- Collect server resource information
- Perform storage optimization checks
- Validate the target endpoint before running k6

### 3. Dummy API for Safe Testing

A dummy API is included to simulate the `/api/login` endpoint. This makes it possible to validate the full automation flow without directly hitting the production PBX service.

The dummy API is useful for:

- Testing the GitHub Actions workflow
- Validating k6 execution
- Checking report generation
- Simulating successful and rate-limited login responses

### 4. k6 Performance Testing

The project uses k6 to execute load and stress testing scenarios. The test script supports different profiles:

- `dummy` profile for lightweight validation
- `production` profile for higher-load scenarios

The k6 script captures key metrics such as:

- Total virtual users
- Total HTTP requests
- Requests per second
- Success and failure rate
- HTTP status breakdown
- Average response time
- P95 response time
- Maximum response time
- Data received and sent
- Connection and waiting time

### 5. SSH Tunnel Support

The workflow can run the k6 test through an SSH tunnel. This allows GitHub Actions to access the dummy API running on the remote server without exposing the dummy API port publicly.

This is safer than opening port `3000` to the public internet.

### 6. Automated HTML and PDF Report Generation

After the k6 test completes, the workflow generates:

- k6 HTML summary report
- k6 JSON summary
- Final PDF report
- Server monitoring logs
- Storage optimization logs

The final PDF report is generated using Puppeteer and includes both technical metrics and QA-oriented analysis.

### 7. AI-Based Summary Support

The project supports AI-generated summaries using Qwen API from Alibaba Cloud.

When enabled, the AI summary can generate:

- Executive summary
- Insight and recommendation
- Risk notes
- Final conclusion

The AI summary is based on real k6 metrics, not on manually written static text.

If the AI API is unavailable, the project can still fall back to a rule-based summary so that the automation does not fail completely.

---

## Project Structure

```text
test-performance-automation/
├── .github/
│   └── workflows/
│       └── monthly-performance-test.yml
│
├── dummy-api/
│   ├── package.json
│   └── server.js
│
├── k6/
│   └── pbx-stress-test.js
│
├── scripts/
│   ├── deploy-dummy-api.sh
│   ├── monitor-remote-server.sh
│   ├── optimize-remote-storage.sh
│   ├── convert-html-to-pdf.js
│   ├── generate-ai-summary.js
│   └── generate-final-report.js
│
├── reports/
├── package.json
└── README.md
````

---

## Workflow Process

The automation follows this process:

```text
GitHub Actions Trigger
        ↓
Validate required secrets
        ↓
Prepare report directory
        ↓
Setup Node.js
        ↓
Setup SSH key
        ↓
Deploy dummy API to testing server
        ↓
Collect CPU, RAM, and storage monitoring data
        ↓
Run storage optimization
        ↓
Install k6
        ↓
Create SSH tunnel to dummy API
        ↓
Run k6 performance test
        ↓
Generate k6 HTML and JSON summary
        ↓
Generate AI summary using Qwen API
        ↓
Generate final PDF report
        ↓
Upload report artifacts
        ↓
Send email notification
```

---

## Required GitHub Secrets

The workflow requires several GitHub repository secrets.

Go to:

```text
Repository Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

Then add the following secrets:

| Secret Name         | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `SSH_HOST`          | Remote testing server IP address or hostname                |
| `SSH_PORT`          | SSH port, usually `22`                                      |
| `SSH_USERNAME`      | SSH username                                                |
| `SSH_PRIVATE_KEY`   | Private key used by GitHub Actions to connect to the server |
| `DUMMY_API_PORT`    | Port used by the dummy API, for example `3000`              |
| `SMTP_SERVER`       | SMTP server for email notification                          |
| `SMTP_PORT`         | SMTP port                                                   |
| `SMTP_USERNAME`     | SMTP username                                               |
| `SMTP_PASSWORD`     | SMTP password                                               |
| `SMTP_FROM`         | Sender email address                                        |
| `DASHSCOPE_API_KEY` | Alibaba Cloud DashScope / Qwen API key                      |
| `QWEN_BASE_URL`     | Qwen OpenAI-compatible API base URL                         |
| `QWEN_MODEL`        | Qwen model name, for example `qwen-plus`                    |

Example Qwen configuration:

```text
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

---

## Running the Workflow Manually

The workflow can be triggered manually from GitHub Actions:

```text
GitHub Repository
→ Actions
→ Monthly PBX Performance Test
→ Run workflow
```

Manual execution is useful for:

* Testing SSH connectivity
* Validating dummy API deployment
* Checking k6 execution
* Debugging report generation
* Verifying email notification

---

## k6 Test Profiles

The k6 script supports multiple test profiles using the `TEST_PROFILE` environment variable.

### Dummy Profile

Used for safe automation validation.

```bash
TEST_PROFILE=dummy
```

Typical load pattern:

```text
5 VUs → 10 VUs → 0 VUs
```

This profile is recommended when running through an SSH tunnel.

### Production Profile

Used for heavier performance testing.

```bash
TEST_PROFILE=production
```

Typical load pattern:

```text
100 VUs → 200 VUs → 300 VUs → 0 VUs
```

This profile should only be used when the target environment has been approved for load testing.

---

## Dummy API

The dummy API simulates the PBX login endpoint:

```text
POST /api/login
```

It is designed to return a mix of successful and rate-limited responses, allowing the report to validate both success and failure scenarios.

A health check endpoint is also available:

```text
GET /health
```

This endpoint is used by the workflow to confirm that the dummy API is running before k6 starts.

---

## Report Output

Each workflow run generates report files under the monthly report directory:

```text
reports/YYYY-MM/
├── ai-summary.json
├── dummy-api.log
├── k6-console-output.log
├── k6-summary.json
├── monitoring-cpu-ram.txt
├── monitoring-storage.txt
├── optimize-storage.txt
├── ssh-tunnel.log
├── stress-test-summary.html
├── stress-test-summary.pdf
└── laporan-pekerjaan-ms-pbx-YYYY-MM.pdf
```

The final report file is:

```text
laporan-pekerjaan-ms-pbx-YYYY-MM.pdf
```

This PDF is uploaded as a GitHub Actions artifact and can also be sent by email.

---

## AI Summary Behavior

The AI summary is generated from structured k6 metrics. The AI does not calculate the raw test data. Instead, the script extracts the metrics first, then sends a clean data object to the Qwen API.

The AI is used only to generate the narrative sections:

* Executive Summary
* Insight and Recommendation
* Risk Notes
* Conclusion

This approach keeps the numeric results deterministic while allowing the written analysis to be more natural and data-aware.

If Qwen API fails, the script can generate a fallback summary so that the report process can continue.

---

## Example AI Analysis Rules

The AI prompt is designed with QA-oriented rules, such as:

* Do not invent numbers.
* Use only the provided metrics.
* If status code breakdown is empty but total requests exist, flag it as a status counter anomaly.
* If `status_429` is `0`, do not conclude that rate limiting is active.
* If P95 response time is below `1000 ms`, classify latency as very good.
* If `status_5xx` is `0`, classify the system as stable from a server error perspective.
* Use formal Indonesian language in the report output.
* Avoid decimal percentages.

---

## Email Notification

The workflow sends email notifications after the report generation process.

A success email includes the generated PDF report as an attachment.

A failure email is sent when the workflow fails, allowing the team to review the GitHub Actions logs and troubleshoot the issue.

---

## Recommended Usage

For regular monthly validation, use the dummy profile first to ensure that:

* GitHub Actions runs correctly
* SSH access works
* Dummy API deployment succeeds
* k6 test execution succeeds
* Report generation succeeds
* AI summary generation works
* Email notification works

After the automation is stable, the workflow can be adapted for staging or production testing with stricter controls and approval gates.

---

## Important Notes

* Do not commit private keys, API keys, SMTP passwords, or other credentials into the repository.
* Store all sensitive values in GitHub Secrets.
* Avoid running high-load production tests without approval.
* Use SSH tunnel mode for dummy testing to avoid exposing test services publicly.
* Review generated reports regularly to ensure the metrics and AI-generated narrative remain accurate.
* If AI summary fails due to quota, billing, or API errors, the workflow should continue using rule-based summary fallback.

---

## Troubleshooting

### SSH connection fails

Check:

* `SSH_HOST`
* `SSH_PORT`
* `SSH_USERNAME`
* `SSH_PRIVATE_KEY`
* Public key in `~/.ssh/authorized_keys` on the server

### Dummy API is not reachable

Check on the server:

```bash
ps aux | grep "node server.js"
curl http://localhost:3000/health
cat /opt/pbx-dummy-api/dummy-api.log
```

### k6 request timeout

Possible causes:

* Dummy API is not running
* SSH tunnel is not created correctly
* Port forwarding failed
* Server firewall blocks the required connection

### AI summary fails

Check:

* `DASHSCOPE_API_KEY`
* `QWEN_BASE_URL`
* `QWEN_MODEL`
* Alibaba Cloud quota or billing status
* GitHub Actions logs for Qwen API response

### Report metrics show zero status codes

This usually means the built-in k6 metrics were captured, but custom status counters were not available in the summary. Review the custom counters in `k6/pbx-stress-test.js`, especially:

```javascript
status_200
status_429
status_500
status_other
```

---

## Future Improvements

Potential improvements for this project include:

* Running k6 directly on the testing server for higher-load scenarios
* Adding Grafana or Prometheus integration
* Adding historical trend comparison between monthly reports
* Adding Slack or Telegram notifications
* Adding approval gates before production tests
* Improving report branding with company logo and standardized formatting
* Adding baseline comparison for response time, RPS, and failure rate
* Adding automatic anomaly detection based on previous monthly results

---

## Maintainer Notes

This project is intended to support QA and operations teams in performing repeatable, auditable, and scheduled performance validation. It should be treated as a living automation project, where test profiles, thresholds, report templates, and analysis rules can evolve as the PBX service and operational requirements change.

```
```
