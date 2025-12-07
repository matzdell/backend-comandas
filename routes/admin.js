// routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');

// ===== USUARIOS =====
router.post('/users', async (req, res) => {
  console.log('[POST /api/admin/users] body =', req.body);

  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const roleMap = {
      Mesero: 1,
      Cocinero: 2,
      Cajero: 3,
      Jefe: 4,
    };

    const role_id = roleMap[rol];
    if (!role_id) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, role_id`,
      [nombre, email, hash, role_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/admin/users] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

//
// ===== CATEGORÍAS (para combos en el front) =====
// GET /api/admin/categorias
//
router.get('/categorias', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, nombre FROM categorias ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/admin/categorias] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

//
// ===== PRODUCTOS =====
//

// Crear producto
router.post('/productos', async (req, res) => {
  console.log('[POST /api/admin/productos] body =', req.body);

  try {
    const { nombre, categoria, precio } = req.body;

    if (!nombre || !categoria || precio == null) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    // categoria = nombre de la categoría → buscamos su id
    const { rows: catRows } = await db.query(
      'SELECT id FROM categorias WHERE nombre = $1 LIMIT 1',
      [categoria]
    );

    if (catRows.length === 0) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    const id_categoria = catRows[0].id;

    const result = await db.query(
      `INSERT INTO productos (nombre, id_categoria, precio)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, id_categoria, precio, disponible`,
      [nombre, id_categoria, precio]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/admin/productos] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar todos los productos (incluyendo no disponibles)
router.get('/productos', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id,
              p.nombre,
              p.id_categoria,
              p.precio,
              p.disponible,
              c.nombre AS categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.id_categoria
       ORDER BY p.id`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/admin/productos] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar un producto
router.put('/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, id_categoria, precio, disponible } = req.body;

  if (!nombre || !id_categoria || precio == null) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE productos
       SET nombre = $1,
           id_categoria = $2,
           precio = $3,
           disponible = $4
       WHERE id = $5
       RETURNING id, nombre, id_categoria, precio, disponible`,
      [nombre, id_categoria, precio, disponible, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/admin/productos/:id] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar un producto (opcionalmente puedes restringirlo)
router.delete('/productos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // OJO: podrías primero comprobar si se usa en detalle_comanda
    await db.query('DELETE FROM productos WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/productos/:id] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/productos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await db.query(
      `SELECT p.id,
              p.nombre,
              p.id_categoria,
              p.precio,
              p.disponible,
              c.nombre AS categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.id_categoria
       WHERE p.id = $1
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /api/admin/productos/:id] ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// KPI: Ticket promedio por día (últimos 15 días)
router.get("/kpi/ticket-promedio", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        pagado_en::date AS dia,
        COUNT(*)              AS num_comandas,
        SUM(total_pagado)     AS ventas_totales,
        ROUND(AVG(total_pagado)) AS ticket_promedio
      FROM caja_pagos
      WHERE pagado_en::date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY pagado_en::date
      ORDER BY dia;
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error obteniendo KPI ticket promedio:", err);
    res
      .status(500)
      .json({ error: "Error al obtener KPI ticket promedio", detalle: err.message });
  }
});

router.get("/kpi/ticket-promedio", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        pagado_en::date AS dia,
        COUNT(*)              AS num_comandas,
        SUM(total_pagado)     AS ventas_totales,
        ROUND(AVG(total_pagado)) AS ticket_promedio
      FROM caja_pagos
      GROUP BY pagado_en::date
      ORDER BY dia;
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error obteniendo KPI ticket promedio:", err);
    res.status(500).json({
      error: "Error al obtener KPI ticket promedio",
      detalle: err.message,
    });
  }
});


module.exports = router;
