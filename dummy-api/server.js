const express = require('express');

const app = express();
app.use(express.json());

let requestCounter = 0;

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'dummy-pbx-api',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/login', async (req, res) => {
  requestCounter += 1;

  const { email, password, visitor_id } = req.body || {};

  await new Promise((resolve) => setTimeout(resolve, Math.random() * 500));

  if (!email || !password || !visitor_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Simulate production-like login protection/rate limiting.
  // 4 of 5 requests return 429; 1 of 5 returns 200 with token.
  if (requestCounter % 5 !== 0) {
    return res.status(429).json({ message: 'Too many requests' });
  }

  return res.status(200).json({
    message: 'Login success',
    data: { token: 'dummy-token-' + Date.now() },
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dummy PBX API running on port ${port}`);
});
