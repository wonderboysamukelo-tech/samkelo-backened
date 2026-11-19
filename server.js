 const express = require('express');

const app = express();
app.use(express.json());

const SAMKELO_API_URL = (process.env.SAMKELO_API_URL || process.env.WONDERCARE_API_URL || '').replace(/\/+$/, '');
const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'wonderboysamukelo@gmail.com';

const clinicState = new Map();
const securityAlerts = [];

async function callSamkeloIntegration(endpointPath, method = 'GET', body = null) {
  if (!SAMKELO_API_URL || !INTEGRATION_API_KEY) {
    throw new Error('SAMKELO_API_URL and INTEGRATION_API_KEY must be set in environment variables');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-integration-api-key': INTEGRATION_API_KEY
    }
  };

  if (body !== null) {
    const safeBody = { ...body };
    delete safeBody.password;
    delete safeBody.pass;
    delete safeBody.passwordHash;
    options.body = JSON.stringify(safeBody);
  }

  const response = await fetch(`${SAMKELO_API_URL}${endpointPath}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Samkelo integration error (${response.status}): ${text}`);
  }
  return response.json();
}

app.get('/api/samkelo/overview', async (req, res) => {
  try {
    const data = await callSamkeloIntegration('/api/integration/overview', 'GET');
    const safeUsers = Array.isArray(data.users)
      ? data.users.map(({ password, pass, passwordHash, ...rest }) => rest)
      : [];
    const safeClinics = Array.isArray(data.clinics)
      ? data.clinics.map(({ password, pass, passwordHash, ...rest }) => rest)
      : [];
    return res.json({ ...data, users: safeUsers, clinics: safeClinics });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post('/api/integration/clinics/:id/status', async (req, res) => {
  const { id } = req.params;
  const { active } = req.body || {};
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }

  try {
    const remoteResult = await callSamkeloIntegration(`/api/integration/clinics/${encodeURIComponent(id)}/status`, 'POST', { active });
    clinicState.set(id, { id, active });
    securityAlerts.unshift({
      to: ALERT_EMAIL,
      eventType: 'Super Admin Action',
      detail: `Clinic ${id} status set to ${active ? 'Active' : 'Suspended'}`,
      timestamp: new Date().toISOString()
    });
    return res.json({ ok: true, id, active, remoteResult });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post('/api/security/alerts', (req, res) => {
  const { eventType, detail } = req.body || {};
  const alertItem = {
    to: ALERT_EMAIL,
    eventType: eventType || 'Security Alert',
    detail: detail || '',
    timestamp: new Date().toISOString()
  };
  securityAlerts.unshift(alertItem);
  return res.json({ ok: true, alert: alertItem });
});

app.listen(process.env.PORT || 3000);
