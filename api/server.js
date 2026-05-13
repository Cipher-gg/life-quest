import express from 'express';
import Database from 'better-sqlite3';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PORT = parseInt(process.env.PORT || '3000', 10);
const TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const AUD = process.env.CF_ACCESS_AUD;
const DB_PATH = process.env.DB_PATH || '/data/users.db';
const SKIP_AUTH = process.env.SKIP_AUTH === '1';

if (!SKIP_AUTH && (!TEAM_DOMAIN || !AUD)) {
  console.error('FATAL: CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set (or SKIP_AUTH=1 for local dev).');
  process.exit(1);
}

const JWKS = SKIP_AUTH ? null : createRemoteJWKSet(
  new URL(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`)
);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    state_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );
`);

const selectState = db.prepare('SELECT state_json FROM users WHERE email = ?');
const upsertState = db.prepare(`
  INSERT INTO users (email, state_json, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
`);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

async function authenticate(req, res, next) {
  if (SKIP_AUTH) {
    req.email = 'dev@local';
    return next();
  }
  const token = req.header('Cf-Access-Jwt-Assertion');
  if (!token) return res.status(401).json({ error: 'missing Cf-Access-Jwt-Assertion header' });
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: AUD,
      issuer: `https://${TEAM_DOMAIN}`,
    });
    const email = (payload.email || payload.identity || '').toString().toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'no email claim in token' });
    req.email = email;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token', detail: e.message });
  }
}

app.get('/api/healthz', (_req, res) => res.type('text/plain').send('ok'));

app.get('/api/me', authenticate, (req, res) => {
  res.json({ email: req.email });
});

app.get('/api/state', authenticate, (req, res) => {
  const row = selectState.get(req.email);
  if (!row) return res.json({});
  try {
    res.json(JSON.parse(row.state_json));
  } catch {
    res.json({});
  }
});

app.post('/api/state', authenticate, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'body must be a JSON object' });
  }
  upsertState.run(req.email, JSON.stringify(req.body), Date.now());
  // Don't log the body — it's personal life data. Log only the action.
  console.log(`[state] saved ${req.email} (${JSON.stringify(req.body).length} bytes)`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`life-quest api listening on :${PORT} (SKIP_AUTH=${SKIP_AUTH ? '1' : '0'})`);
});
