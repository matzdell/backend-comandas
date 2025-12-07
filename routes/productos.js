const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (_req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM productos WHERE disponible = TRUE ORDER BY id_categoria, nombre'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/productos] DB error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;