// routes/comandas.js
const express = require('express');
const router = express.Router();
const db = require('../db');

let io;
function setSocketInstance(_io) { io = _io; }

// Crear comanda
router.post('/', async (req, res) => {
  console.log('[POST /api/comandas] body =', JSON.stringify(req.body, null, 2));

  try {
    const { mesa, id_mesero, productos } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'La comanda no tiene productos' });
    }

    const comanda = await db.query(
      'INSERT INTO comandas (mesa, id_mesero) VALUES ($1, $2) RETURNING id',
      [mesa, id_mesero]
    );

    const id_comanda = comanda.rows[0].id;

    for (const p of productos) {
      await db.query(
        'INSERT INTO detalle_comanda (id_comanda, id_producto, cantidad, notas, cliente_nro) VALUES ($1, $2, $3, $4, $5)',
        [id_comanda, p.id_producto, p.cantidad, p.notas || '', p.cliente_nro ?? null]
      );
    }

    const detalles = await db.query(`
      SELECT p.nombre, dc.cantidad, dc.notas, dc.cliente_nro
      FROM detalle_comanda dc
      JOIN productos p ON p.id = dc.id_producto
      WHERE dc.id_comanda = $1
      ORDER BY dc.id
    `, [id_comanda]);

    if (io) {
  const payload = { id_comanda, mesa, detalles: detalles.rows };
  io.emit('nueva_comanda', payload);   // ✅ solo este
  console.log('[SOCKET] emitido: nueva_comanda');
}

    res.status(201).json({ id_comanda });
  } catch (err) {
    console.error('[POST /api/comandas] DB error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar comandas
router.get('/', async (_req, res) => {
  try {
    const { rows: encabezados } = await db.query(
      'SELECT id, mesa, id_mesero, creado_en FROM comandas ORDER BY id DESC LIMIT 50'
    );

    const ids = encabezados.map((c) => c.id);
    let det = [];

    if (ids.length) {
      const { rows } = await db.query(`
        SELECT dc.id_comanda, dc.cantidad, dc.notas, dc.cliente_nro, p.nombre
        FROM detalle_comanda dc
        JOIN productos p ON p.id = dc.id_producto
        WHERE dc.id_comanda = ANY($1)
        ORDER BY dc.id_comanda, dc.id
      `, [ids]);
      det = rows;
    }

    const porId = new Map(encabezados.map((c) => [c.id, { ...c, detalles: [] }]));

    for (const d of det) {
      porId.get(d.id_comanda)?.detalles.push({
        nombre: d.nombre,
        cantidad: d.cantidad,
        notas: d.notas,
        cliente_nro: d.cliente_nro,
      });
    }

    res.json(Array.from(porId.values()));
  } catch (err) {
    console.error('[GET /api/comandas] DB error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  try {
    await db.query("DELETE FROM detalle_comanda WHERE id_comanda = $1", [id]);
    await db.query("DELETE FROM comandas WHERE id = $1", [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando comanda:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = { router, setSocketInstance };
