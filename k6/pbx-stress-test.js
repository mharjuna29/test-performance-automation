import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const loginSuccess = new Counter('login_success');
const loginFailure = new Counter('login_failure');
const status200 = new Counter('status_200');
const status429 = new Counter('status_429');
const status500 = new Counter('status_500');
const statusOther = new Counter('status_other'); 

const TEST_PROFILE = __ENV.TEST_PROFILE || 'dummy';

const stagesByProfile = {
    dummy: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 5 },
    { duration: "10s", target: 10 },
    { duration: "20s", target: 10 },
    { duration: "10s", target: 0 },
  ],

    production: [
    { duration: "2m", target: 100 },
    { duration: "5m", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "5m", target: 200 },
    { duration: "2m", target: 300 },
    { duration: "5m", target: 300 },
    { duration: "2m", target: 0 },
  ],
};

export let options = {
  stages: stagesByProfile[TEST_PROFILE] || stagesByProfile.dummy,

  thresholds: {
    http_req_duration: ["p(95)<6000"],
    status_500: ["count==0"],
  },
};

// export const options = {
//   stages: [
//     { duration: '2m', target: 100 },
//     { duration: '5m', target: 100 },
//     { duration: '2m', target: 200 },
//     { duration: '5m', target: 200 },
//     { duration: '2m', target: 300 },
//     { duration: '5m', target: 300 },
//     { duration: '2m', target: 0 },
//   ],
//   thresholds: {
//     http_req_duration: ['p(95)<6000'],
//     status_500: ['count==0'],
//   },
// };

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const credentials = [
  {
    email: __ENV.PBX_EMAIL || 'dummy@example.com',
    password: __ENV.PBX_PASSWORD || 'password123',
  },
];

export default function () {
  const cred = credentials[Math.floor(Math.random() * credentials.length)];

  const loginPayload = JSON.stringify({
    email: cred.email,
    password: cred.password,
    visitor_id: __ENV.VISITOR_ID || 'dummy-visitor-id',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(`${BASE_URL}/api/login`, loginPayload, params);

  const isSuccess = check(response, {
    'is status 200 or expected 429': (r) => r.status === 200 || r.status === 429,
    'has valid token when 200': (r) => {
      if (r.status !== 200) return true;
      try {
        const json = r.json();
        return Boolean(json && json.data && json.data.token);
      } catch (e) {
        return false;
      }
    },
  });

  // switch (response.status) {
  //   case 200:
  //     status200.add(1);
  //     break;
  //   case 429:
  //     status429.add(1);
  //     break;
  //   case 500:
  //   case 502:
  //   case 503:
  //   case 504:
  //     status500.add(1);
  //     break;
  //   default:
  //     statusOther.add(1);
  // }

  if (response.status === 200 && isSuccess) {
    loginSuccess.add(1);
  } else {
    loginFailure.add(1);
  }
  
  if (response && response.status) {
  switch (response.status) {
    case 200:
      status200.add(1);
      break;

    case 429:
      status429.add(1);
      break;

    case 500:
    case 502:
    case 503:
    case 504:
      status500.add(1);
      break;

    default:
      statusOther.add(1);
      break;
  }
} else {
  statusOther.add(1);
}

  sleep(Math.random() * 3 + 2);
}

function metricValue(data, metric, value, fallback = 0) {
  return data.metrics?.[metric]?.values?.[value] ?? fallback;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const uniqueFilename = `stress-test-summary-${timestamp}.html`;

  const totalRequests = metricValue(data, 'http_reqs', 'count');
  const httpFailedRate = metricValue(data, 'http_req_failed', 'rate');
  const p95 = metricValue(data, 'http_req_duration', 'p(95)');
  const status5xx = metricValue(data, 'status_500', 'count');
  const status429Count = metricValue(data, 'status_429', 'count');
  const status200Count = metricValue(data, 'status_200', 'count');
  const testStages = options.stages.map((stage) => {
  return `${stage.target} VUs (${stage.duration})`;
});

  const thresholdStatus = {
    'P95 Response Time < 6s': p95 < 6000 ? 'PASS' : 'FAIL',
    'Server Error 5xx = 0': status5xx === 0 ? 'PASS' : 'FAIL',
    'Rate Limiting Detected': status429Count > 0 ? 'PASS' : 'WARNING',
  };

  const summary = {
    'Test Summary': {
      'Total Duration': `${Math.round((data.state?.testRunDurationMs || 0) / 1000)}s`,
      'Total VUs': metricValue(data, 'vus_max', 'max'),
      'Total Iterations': metricValue(data, 'iterations', 'count'),
      'Total HTTP Requests': totalRequests,
    },
    'Performance Metrics': {
      'Avg Response Time': `${Math.round(metricValue(data, 'http_req_duration', 'avg'))}ms`,
      'Min Response Time': `${Math.round(metricValue(data, 'http_req_duration', 'min'))}ms`,
      'Max Response Time': `${Math.round(metricValue(data, 'http_req_duration', 'max'))}ms`,
      'P95 Response Time': `${Math.round(p95)}ms`,
      'P99 Response Time': `${Math.round(metricValue(data, 'http_req_duration', 'p(99)'))}ms`,
    },
    'Success/Failure Rates': {
      'HTTP Success Rate': `${((1 - httpFailedRate) * 100).toFixed(2)}%`,
      'HTTP Failure Rate': `${(httpFailedRate * 100).toFixed(2)}%`,
      'Login Successes': metricValue(data, 'login_success', 'count'),
      'Login Failures': metricValue(data, 'login_failure', 'count'),
    },
    Throughput: {
      'Requests per Second': `${metricValue(data, 'http_reqs', 'rate').toFixed(2)} req/s`,
      'Data Received': formatBytes(metricValue(data, 'data_received', 'count')),
      'Data Sent': formatBytes(metricValue(data, 'data_sent', 'count')),
    },
    'Connection Metrics': {
      'Avg Connection Time': `${Math.round(metricValue(data, 'http_req_connecting', 'avg'))}ms`,
      'Avg TLS Handshake': `${Math.round(metricValue(data, 'http_req_tls_handshaking', 'avg'))}ms`,
      'Avg Waiting Time': `${Math.round(metricValue(data, 'http_req_waiting', 'avg'))}ms`,
    },
  };

  const htmlReport = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>K6 Stress Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #222; }
    .header { text-align: center; color: #333; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .metric { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f2f2f2; }
    .value { font-weight: bold; color: #007acc; }
    .success { color: #28a745; }
    .warning { color: #ffc107; }
    .danger { color: #dc3545; }
    .status-pass { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 3px; }
    .status-fail { background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 3px; }
    .status-warning { background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1 class="header">K6 Stress Test Summary Report</h1>
  <p class="header">Generated: ${new Date().toLocaleString()}</p>
  <div class="section">
    <h2>Test Status</h2>
    <div class="metric"><span>Target URL:</span><span class="value">${BASE_URL}</span></div>
    <div class="metric"><span>Test Stages:</span><span class="value">0 → 100 → 200 → 300 → 0 VUs</span></div>
    ${Object.entries(thresholdStatus).map(([key, status]) => `<div class="metric"><span>${key}:</span><span class="${status === 'PASS' ? 'status-pass' : status === 'FAIL' ? 'status-fail' : 'status-warning'}">${status}</span></div>`).join('')}
  </div>
  <div class="section">
    <h2>HTTP Status Details</h2>
    <div class="metric"><span>Status 200:</span><span class="value success">${status200Count}</span></div>
    <div class="metric"><span>Status 429:</span><span class="value warning">${status429Count}</span></div>
    <div class="metric"><span>Status 5xx:</span><span class="value danger">${status5xx}</span></div>
    <div class="metric"><span>Other Status Codes:</span><span class="value">${metricValue(data, 'status_other', 'count')}</span></div>
    <div class="metric"><span>Success Rate 200:</span><span class="value success">${((status200Count / (totalRequests || 1)) * 100).toFixed(2)}%</span></div>
  </div>
  ${Object.entries(summary).map(([category, metrics]) => `<div class="section"><h2>${category}</h2>${Object.entries(metrics).map(([key, value]) => `<div class="metric"><span>${key}:</span><span class="value">${value}</span></div>`).join('')}</div>`).join('')}
</body>
</html>`;

  return {
    [uniqueFilename]: htmlReport,
  };
}
