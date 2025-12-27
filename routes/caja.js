// backend/routes/caja.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/caja/totales - Obtener totales de todas las mesas
router.get('/totales', async (req, res) => {
  try {
    // Obtener comandas que NO han sido pagadas
    const result = await pool.query(`
      SELECT 
        c.id as id_comanda,
        c.mesa,
        c.creado_en,
        c.estado,
        COALESCE(SUM(dc.cantidad * p.precio), 0) as total
      FROM comandas c
      LEFT JOIN detalle_comanda dc ON c.id = dc.id_comanda
      LEFT JOIN productos p ON dc.id_producto = p.id
      WHERE c.estado != 'PAGADA'
      GROUP BY c.id, c.mesa, c.creado_en, c.estado
      ORDER BY c.mesa
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener totales:', error);
    res.status(500).json({ error: 'Error al obtener totales de mesas' });
  }
});

// GET /api/caja/detalle/:mesa - Obtener detalle de una mesa
router.get('/detalle/:mesa', async (req, res) => {
  try {
    const { mesa } = req.params;

    // Buscar comanda activa (no pagada) de la mesa
    const comandaResult = await pool.query(`
      SELECT id, mesa, creado_en, estado
      FROM comandas
      WHERE mesa = $1 AND estado != 'PAGADA'
      ORDER BY creado_en DESC
      LIMIT 1
    `, [mesa]);

    if (comandaResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay comanda activa en esta mesa' });
    }

    const comanda = comandaResult.rows[0];

    // Obtener detalles de la comanda
    const detallesResult = await pool.query(`
      SELECT 
        dc.id,
        dc.id_producto,
        p.nombre as nombre_producto,
        dc.cantidad,
        p.precio,
        (dc.cantidad * p.precio) as subtotal,
        dc.notas,
        dc.cliente_nro
      FROM detalle_comanda dc
      INNER JOIN productos p ON dc.id_producto = p.id
      WHERE dc.id_comanda = $1
      ORDER BY dc.id
    `, [comanda.id]);

    const total = detallesResult.rows.reduce((sum, item) => sum + Number(item.subtotal), 0);

    res.json({
      ...comanda,
      detalles: detallesResult.rows,
      total,
    });
  } catch (error) {
    console.error('Error al obtener detalle de mesa:', error);
    res.status(500).json({ error: 'Error al obtener detalle de la mesa' });
  }
});

// POST /api/caja/pagar - Procesar pago
router.post('/pagar', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      id_comanda,
      mesa,
      total_sin_propina,
      propina,
      total_pagado,
      metodo_pago,
      monto_entregado,
      cambio,
      usuario_cajero,
    } = req.body;

    // Validaciones
    if (!id_comanda || !mesa || total_sin_propina == null || !metodo_pago) {
      throw new Error('Faltan datos requeridos');
    }

    // Insertar registro de pago
    const pagoResult = await client.query(`
      INSERT INTO caja_pagos (
        id_comanda,
        mesa,
        total_sin_propina,
        propina,
        total_pagado,
        metodo_pago,
        monto_entregado,
        cambio,
        usuario_cajero,
        pagado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      id_comanda,
      mesa,
      total_sin_propina,
      propina || 0,
      total_pagado || total_sin_propina,
      metodo_pago,
      monto_entregado || 0,
      cambio || 0,
      usuario_cajero || 'Sistema',
    ]);

    // Actualizar estado de la comanda a PAGADA
    await client.query(`
      UPDATE comandas
      SET estado = 'PAGADA'
      WHERE id = $1
    `, [id_comanda]);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Pago registrado exitosamente',
      pago: pagoResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al procesar pago:', error);
    res.status(500).json({ error: error.message || 'Error al procesar el pago' });
  } finally {
    client.release();
  }
});

// GET /api/caja/historial - Obtener historial de pagos
router.get('/historial', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, limite = 50 } = req.query;

    let query = `
      SELECT 
        cp.*,
        c.creado_en as comanda_creada_en
      FROM caja_pagos cp
      LEFT JOIN comandas c ON cp.id_comanda = c.id
      WHERE 1=1
    `;
    const params = [];

    if (fecha_inicio) {
      params.push(fecha_inicio);
      query += ` AND cp.pagado_en >= $${params.length}`;
    }

    if (fecha_fin) {
      params.push(fecha_fin);
      query += ` AND cp.pagado_en <= $${params.length}`;
    }

    query += ` ORDER BY cp.pagado_en DESC LIMIT $${params.length + 1}`;
    params.push(limite);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error al obtener historial de pagos' });
  }
});

// Función auxiliar para obtener totales (usada por sockets)
async function obtenerTotalesMesas() {
  try {
    const result = await pool.query(`
      SELECT 
        c.id as id_comanda,
        c.mesa,
        c.creado_en,
        c.estado,
        COALESCE(SUM(dc.cantidad * p.precio), 0) as total
      FROM comandas c
      LEFT JOIN detalle_comanda dc ON c.id = dc.id_comanda
      LEFT JOIN productos p ON dc.id_producto = p.id
      WHERE c.estado != 'PAGADA'
      GROUP BY c.id, c.mesa, c.creado_en, c.estado
      ORDER BY c.mesa
    `);
    return result.rows;
  } catch (error) {
    console.error('Error en obtenerTotalesMesas:', error);
    throw error;
  }
}

// Exportar la función para uso en sockets
router.obtenerTotalesMesas = obtenerTotalesMesas;

module.exports = router;
