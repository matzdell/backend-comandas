// backend/routes/kpi.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // Tu conexión a PostgreSQL

// ==========================================
// KPI 1: Dashboard Principal - Resumen General
// ==========================================
router.get('/resumen-general', async (req, res) => {
  try {
    const { dias = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT cp.id_pago) as total_transacciones,
        COUNT(DISTINCT cp.mesa) as mesas_atendidas,
        SUM(cp.total_sin_propina) as ventas_totales,
        SUM(cp.propina) as propinas_totales,
        SUM(cp.total_pagado) as ingresos_totales,
        ROUND(AVG(cp.total_sin_propina), 2) as ticket_promedio,
        ROUND(AVG(cp.propina), 2) as propina_promedio
      FROM caja_pagos cp
      WHERE cp.pagado_en >= CURRENT_DATE - INTERVAL '${dias} days'
    `);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en resumen general:', error);
    res.status(500).json({ error: 'Error al obtener resumen general' });
  }
});

// ==========================================
// KPI 2: Top Productos Más Vendidos
// ==========================================
router.get('/top-productos', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        c.nombre as categoria,
        SUM(dc.cantidad) as cantidad_vendida,
        SUM(dc.cantidad * p.precio) as ingresos_generados,
        p.precio as precio_unitario
      FROM detalle_comanda dc
      INNER JOIN productos p ON dc.id_producto = p.id
      LEFT JOIN categorias c ON p.id_categoria = c.id
      INNER JOIN comandas cmd ON dc.id_comanda = cmd.id
      WHERE cmd.estado = 'PAGADA'
      GROUP BY p.id, p.nombre, c.nombre, p.precio
      ORDER BY cantidad_vendida DESC
      LIMIT $1
    `, [limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en top productos:', error);
    res.status(500).json({ error: 'Error al obtener top productos' });
  }
});

// ==========================================
// KPI 3: Ventas por Categoría
// ==========================================
router.get('/ventas-categoria', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(c.nombre, 'Sin categoría') as categoria,
        COUNT(DISTINCT dc.id) as items_vendidos,
        SUM(dc.cantidad) as cantidad_total,
        SUM(dc.cantidad * p.precio) as ingresos
      FROM detalle_comanda dc
      INNER JOIN productos p ON dc.id_producto = p.id
      LEFT JOIN categorias c ON p.id_categoria = c.id
      INNER JOIN comandas cmd ON dc.id_comanda = cmd.id
      WHERE cmd.estado = 'PAGADA'
      GROUP BY c.nombre
      ORDER BY ingresos DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en ventas por categoría:', error);
    res.status(500).json({ error: 'Error al obtener ventas por categoría' });
  }
});

// ==========================================
// KPI 4: Distribución de Métodos de Pago
// ==========================================
router.get('/metodos-pago', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        metodo_pago,
        COUNT(*) as cantidad_transacciones,
        SUM(total_pagado) as total_monto,
        ROUND(AVG(total_pagado), 2) as monto_promedio,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as porcentaje
      FROM caja_pagos
      GROUP BY metodo_pago
      ORDER BY cantidad_transacciones DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en métodos de pago:', error);
    res.status(500).json({ error: 'Error al obtener métodos de pago' });
  }
});

// ==========================================
// KPI 5: Ventas por Día (Serie de Tiempo)
// ==========================================
router.get('/ventas-diarias', async (req, res) => {
  try {
    const { dias = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        DATE(pagado_en) as fecha,
        COUNT(DISTINCT id_pago) as num_transacciones,
        SUM(total_sin_propina) as ventas,
        SUM(propina) as propinas,
        SUM(total_pagado) as ingresos_totales,
        ROUND(AVG(total_sin_propina), 2) as ticket_promedio
      FROM caja_pagos
      WHERE pagado_en >= CURRENT_DATE - INTERVAL '${dias} days'
      GROUP BY DATE(pagado_en)
      ORDER BY fecha ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en ventas diarias:', error);
    res.status(500).json({ error: 'Error al obtener ventas diarias' });
  }
});

// ==========================================
// KPI 6: Horarios Pico (Ventas por Hora)
// ==========================================
router.get('/horarios-pico', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM pagado_en) as hora,
        COUNT(*) as num_transacciones,
        SUM(total_pagado) as ingresos,
        ROUND(AVG(total_sin_propina), 2) as ticket_promedio
      FROM caja_pagos
      GROUP BY EXTRACT(HOUR FROM pagado_en)
      ORDER BY hora
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en horarios pico:', error);
    res.status(500).json({ error: 'Error al obtener horarios pico' });
  }
});

// ==========================================
// KPI 7: Mesas Más Productivas
// ==========================================
router.get('/mesas-productivas', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        mesa,
        COUNT(*) as num_pagos,
        SUM(total_sin_propina) as ventas_totales,
        SUM(propina) as propinas_totales,
        ROUND(AVG(total_sin_propina), 2) as ticket_promedio
      FROM caja_pagos
      GROUP BY mesa
      ORDER BY ventas_totales DESC
      LIMIT $1
    `, [limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en mesas productivas:', error);
    res.status(500).json({ error: 'Error al obtener mesas productivas' });
  }
});

// ==========================================
// KPI 8: Comparativa Períodos
// ==========================================
router.get('/comparativa-periodos', async (req, res) => {
  try {
    const result = await pool.query(`
      WITH ultimos_7 AS (
        SELECT 
          SUM(total_sin_propina) as ventas,
          COUNT(*) as transacciones,
          ROUND(AVG(total_sin_propina), 2) as ticket_promedio
        FROM caja_pagos
        WHERE pagado_en >= CURRENT_DATE - INTERVAL '7 days'
      ),
      anteriores_7 AS (
        SELECT 
          SUM(total_sin_propina) as ventas,
          COUNT(*) as transacciones,
          ROUND(AVG(total_sin_propina), 2) as ticket_promedio
        FROM caja_pagos
        WHERE pagado_en >= CURRENT_DATE - INTERVAL '14 days'
          AND pagado_en < CURRENT_DATE - INTERVAL '7 days'
      )
      SELECT 
        u.ventas as ventas_ultimos_7,
        a.ventas as ventas_anteriores_7,
        ROUND(((u.ventas - COALESCE(a.ventas, 0)) / NULLIF(a.ventas, 1)) * 100, 2) as cambio_porcentual_ventas,
        u.transacciones as transacciones_ultimos_7,
        a.transacciones as transacciones_anteriores_7,
        u.ticket_promedio as ticket_ultimos_7,
        a.ticket_promedio as ticket_anteriores_7
      FROM ultimos_7 u, anteriores_7 a
    `);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en comparativa periodos:', error);
    res.status(500).json({ error: 'Error al obtener comparativa de periodos' });
  }
});

// ==========================================
// KPI 9: Análisis de Propinas
// ==========================================
router.get('/analisis-propinas', async (req, res) => {
  try {
    const { dias = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        DATE(pagado_en) as fecha,
        metodo_pago,
        COUNT(*) as num_pagos,
        SUM(propina) as total_propinas,
        ROUND(AVG(propina), 2) as propina_promedio,
        ROUND(AVG(CASE WHEN total_sin_propina > 0 
          THEN (propina * 100.0 / total_sin_propina) 
          ELSE 0 END), 2) as porcentaje_promedio_propina
      FROM caja_pagos
      WHERE pagado_en >= CURRENT_DATE - INTERVAL '${dias} days'
      GROUP BY DATE(pagado_en), metodo_pago
      ORDER BY fecha DESC, metodo_pago
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en análisis de propinas:', error);
    res.status(500).json({ error: 'Error al obtener análisis de propinas' });
  }
});

// ==========================================
// KPI 10: Productos con Menor Rotación
// ==========================================
router.get('/productos-baja-rotacion', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        c.nombre as categoria,
        COALESCE(SUM(dc.cantidad), 0) as veces_vendido,
        p.precio,
        p.disponible
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      LEFT JOIN detalle_comanda dc ON p.id = dc.id_producto
      LEFT JOIN comandas cmd ON dc.id_comanda = cmd.id AND cmd.estado = 'PAGADA'
      WHERE p.disponible = true
      GROUP BY p.id, p.nombre, c.nombre, p.precio, p.disponible
      ORDER BY veces_vendido ASC
      LIMIT $1
    `, [limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en productos baja rotación:', error);
    res.status(500).json({ error: 'Error al obtener productos de baja rotación' });
  }
});

// ==========================================
// KPI COMBO: Dashboard Completo
// ==========================================
router.get('/dashboard-completo', async (req, res) => {
  try {
    const [
      resumen,
      topProductos,
      ventasCategoria,
      metodosPago,
      ventasDiarias,
      comparativa
    ] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(DISTINCT cp.id_pago) as total_transacciones,
          COUNT(DISTINCT cp.mesa) as mesas_atendidas,
          SUM(cp.total_sin_propina) as ventas_totales,
          SUM(cp.propina) as propinas_totales,
          SUM(cp.total_pagado) as ingresos_totales,
          ROUND(AVG(cp.total_sin_propina), 2) as ticket_promedio,
          ROUND(AVG(cp.propina), 2) as propina_promedio
        FROM caja_pagos cp
        WHERE cp.pagado_en >= CURRENT_DATE - INTERVAL '30 days'
      `),
      pool.query(`
        SELECT 
          p.nombre,
          SUM(dc.cantidad) as cantidad_vendida,
          SUM(dc.cantidad * p.precio) as ingresos_generados
        FROM detalle_comanda dc
        INNER JOIN productos p ON dc.id_producto = p.id
        INNER JOIN comandas cmd ON dc.id_comanda = cmd.id
        WHERE cmd.estado = 'PAGADA'
        GROUP BY p.nombre
        ORDER BY cantidad_vendida DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT 
          COALESCE(c.nombre, 'Sin categoría') as categoria,
          SUM(dc.cantidad * p.precio) as ingresos
        FROM detalle_comanda dc
        INNER JOIN productos p ON dc.id_producto = p.id
        LEFT JOIN categorias c ON p.id_categoria = c.id
        INNER JOIN comandas cmd ON dc.id_comanda = cmd.id
        WHERE cmd.estado = 'PAGADA'
        GROUP BY c.nombre
        ORDER BY ingresos DESC
      `),
      pool.query(`
        SELECT 
          metodo_pago,
          COUNT(*) as cantidad_transacciones,
          SUM(total_pagado) as total_monto
        FROM caja_pagos
        GROUP BY metodo_pago
      `),
      pool.query(`
        SELECT 
          DATE(pagado_en) as fecha,
          SUM(total_sin_propina) as ventas,
          COUNT(*) as num_transacciones
        FROM caja_pagos
        WHERE pagado_en >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(pagado_en)
        ORDER BY fecha ASC
      `),
      pool.query(`
        WITH ultimos_7 AS (
          SELECT SUM(total_sin_propina) as ventas
          FROM caja_pagos
          WHERE pagado_en >= CURRENT_DATE - INTERVAL '7 days'
        ),
        anteriores_7 AS (
          SELECT SUM(total_sin_propina) as ventas
          FROM caja_pagos
          WHERE pagado_en >= CURRENT_DATE - INTERVAL '14 days'
            AND pagado_en < CURRENT_DATE - INTERVAL '7 days'
        )
        SELECT 
          u.ventas as ventas_ultimos_7,
          a.ventas as ventas_anteriores_7,
          ROUND(((u.ventas - COALESCE(a.ventas, 0)) / NULLIF(a.ventas, 1)) * 100, 2) as cambio_porcentual
        FROM ultimos_7 u, anteriores_7 a
      `)
    ]);

    res.json({
      resumen: resumen.rows[0],
      topProductos: topProductos.rows,
      ventasCategoria: ventasCategoria.rows,
      metodosPago: metodosPago.rows,
      ventasDiarias: ventasDiarias.rows,
      comparativa: comparativa.rows[0]
    });
  } catch (error) {
    console.error('Error en dashboard completo:', error);
    res.status(500).json({ error: 'Error al obtener dashboard completo' });
  }
});

module.exports = router;