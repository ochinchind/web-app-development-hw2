const express = require('express');
const { Pool } = require('pg');
const os = require('os');

const app = express();

const PORT = process.env.PORT || 3000;
const APP_MESSAGE = process.env.APP_MESSAGE || 'Hello';
const APP_ENV = process.env.NODE_ENV || 'development';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'appdb',
});

async function initDb(retries = 15, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visits (
          id SERIAL PRIMARY KEY,
          hostname TEXT NOT NULL,
          visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('Connected to database and ensured schema exists');
      return;
    } catch (err) {
      console.log(`DB not ready yet (attempt ${attempt}/${retries}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to database after multiple retries');
}

app.get('/', async (req, res) => {
  try {
    await pool.query('INSERT INTO visits (hostname) VALUES ($1)', [os.hostname()]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM visits');
    res.json({
      message: APP_MESSAGE,
      environment: APP_ENV,
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalVisits: rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/visits', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, hostname, visited_at FROM visits ORDER BY id DESC LIMIT 20'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT} (env=${APP_ENV})`);
    });
  })
  .catch((err) => {
    console.error('Fatal: could not initialize database', err);
    process.exit(1);
  });
