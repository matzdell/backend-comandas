// ============================================================================
// ========== backend-comandas/db.js  =========================================
// ============================================================================

const { Pool } = require('pg');

// Detectamos si la DB está en Render por el host
const isRenderHost = (process.env.PGHOST || '').includes('render.com');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),   // Render usa 5432
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'resto',
  password: process.env.PGPASSWORD || '',

  // 👇 Si es Render ⇒ obliga SSL
  //    Si es local ⇒ sin SSL
  ssl: isRenderHost
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;
