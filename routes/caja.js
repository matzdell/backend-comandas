// routes/caja.js
const express = require("express");
const router = express.Router();
const pool = require("../db"); // conexión a Postgres

// ----------------------------------------------------
// FUNCIÓN AUXILIAR: totales por mesa (para Socket.IO)
// ----------------------------------------------------
async function obtenerTotalesMesas() {
  const result = await pool.query(
    `
    SELECT
      c.mesa AS mesa_id,
      COALESCE(SUM(d.cantidad * COALESCE(p.precio, 0)), 0) AS total
    FROM comandas c
    JOIN detalle_comanda d ON d.id_comanda = c.id
    JOIN productos p ON p.id = d.id_producto
    WHERE c.estado <> 'PAGADA'
    GROUP BY c.mesa
    ORDER BY c.mesa;
    `
  );

  return result.rows.map((row) => ({
    mesaId: Number(row.mesa_id),
    total: Number(row.total || 0),
    estado: "Abierta", // si está en esta lista, es porque tiene consumo abierto
  }));
}

// ⚠️ IMPORTANTE: enganchamos la función al router
router.obtenerTotalesMesas = obtenerTotalesMesas;

// ----------------------------------------------------
// GET /api/caja/ultima
// Devuelve la última comanda con sus ítems
// ----------------------------------------------------
router.get("/ultima", async (req, res) => {
  try {
    const comandaResult = await pool.query(
      `
      SELECT id, mesa, creado_en, estado
      FROM comandas
      ORDER BY id DESC
      LIMIT 1;
      `
    );

    if (comandaResult.rows.length === 0) {
      return res.json(null);
    }

    const comanda = comandaResult.rows[0];
    const id_comanda = comanda.id;

    const itemsResult = await pool.query(
      `
      SELECT
        p.nombre AS nombre,
        d.cantidad AS cantidad,
        COALESCE(p.precio, 0) AS precio,
        (d.cantidad * COALESCE(p.precio, 0)) AS subtotal,
        d.cliente_nro,
        d.notas
      FROM detalle_comanda d
      JOIN productos p
        ON p.id = d.id_producto
      WHERE d.id_comanda = $1
      ORDER BY d.id_comanda ASC, p.nombre ASC;
      `,
      [id_comanda]
    );

    const items = itemsResult.rows || [];
    const total = items.reduce(
      (acc, item) => acc + Number(item.subtotal || 0),
      0
    );

    res.json({
      id_comanda: comanda.id,
      mesa: comanda.mesa,
      creado_en: comanda.creado_en,
      estado: comanda.estado,
      total,
      items,
    });
  } catch (err) {
    console.error("Error obteniendo última comanda:", err);
    res.status(500).json({ error: "Error al cargar última comanda" });
  }
});

// ----------------------------------------------------
// GET /api/caja/mesa/:mesa
// Devuelve la ÚLTIMA comanda de esa mesa (aunque tenga varias)
// ----------------------------------------------------
router.get("/mesa/:mesa", async (req, res) => {
  try {
    const mesaNumero = Number(req.params.mesa);

    const comandaResult = await pool.query(
      `
      SELECT id, mesa, creado_en, estado
      FROM comandas
      WHERE mesa = $1
      ORDER BY id DESC
      LIMIT 1;
      `,
      [mesaNumero]
    );

    if (comandaResult.rows.length === 0) {
      return res.json(null);
    }

    const comanda = comandaResult.rows[0];

    // Si NO quieres mostrar comandas ya pagadas en Caja, descomenta:
    // if (comanda.estado === 'PAGADA') {
    //   return res.json(null);
    // }

    const id_comanda = comanda.id;

    const itemsResult = await pool.query(
      `
      SELECT
        p.nombre AS nombre,
        d.cantidad AS cantidad,
        COALESCE(p.precio, 0) AS precio,
        (d.cantidad * COALESCE(p.precio, 0)) AS subtotal,
        d.cliente_nro,
        d.notas
      FROM detalle_comanda d
      JOIN productos p
        ON p.id = d.id_producto
      WHERE d.id_comanda = $1
      ORDER BY d.id_comanda ASC, p.nombre ASC;
      `,
      [id_comanda]
    );

    const items = itemsResult.rows || [];
    const total = items.reduce(
      (acc, item) => acc + Number(item.subtotal || 0),
      0
    );

    res.json({
      id_comanda: comanda.id,
      mesa: comanda.mesa,
      creado_en: comanda.creado_en,
      estado: comanda.estado,
      total,
      items,
    });
  } catch (err) {
    console.error("Error obteniendo comanda por mesa:", err);
    res.status(500).json({ error: "Error al cargar comanda por mesa" });
  }
});

// ----------------------------------------------------
// POST /api/caja/pagar
// Guarda el pago en caja_pagos y marca la comanda como PAGADA
// ----------------------------------------------------
router.post("/pagar", async (req, res) => {
  try {
    const {
      id_comanda,
      mesa,
      total_sin_propina,
      propina,
      total_pagado,
      metodo_pago,
      monto_entregado,
      cambio,
    } = req.body;

    if (!id_comanda || !total_sin_propina || !total_pagado || !metodo_pago) {
      return res.status(400).json({ error: "Datos de pago incompletos" });
    }

    const insertResult = await pool.query(
      `
      INSERT INTO caja_pagos (
        id_comanda,
        mesa,
        total_sin_propina,
        propina,
        total_pagado,
        metodo_pago,
        monto_entregado,
        cambio
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
      `,
      [
        id_comanda,
        mesa || null,
        total_sin_propina,
        propina,
        total_pagado,
        metodo_pago,
        monto_entregado || null,
        cambio || 0,
      ]
    );

    console.log("Pago guardado en caja_pagos:", insertResult.rows[0]);

    // Marcar comanda como PAGADA
    try {
      await pool.query(
        `
        UPDATE comandas
        SET estado = 'PAGADA'
        WHERE id = $1;
        `,
        [id_comanda]
      );
    } catch (errUpdate) {
      console.warn(
        "No se pudo actualizar estado de comanda (no es crítico):",
        errUpdate.message
      );
    }

    res.json({ ok: true, pago: insertResult.rows[0] });
  } catch (err) {
    console.error("Error al registrar pago:", err);
    res.status(500).json({
      error: "Error al registrar el pago",
      detalle: err.message,
    });
  }
});

// ----------------------------------------------------
// GET /api/caja/historial
// ----------------------------------------------------
router.get("/historial", async (req, res) => {
  try {
    const { desde, hasta, mesa, metodo_pago, limit } = req.query;

    const condiciones = [];
    const valores = [];
    let idx = 1;

    if (desde) {
      condiciones.push(`pagado_en >= $${idx++}`);
      valores.push(desde + " 00:00:00");
    }

    if (hasta) {
      condiciones.push(`pagado_en <= $${idx++}`);
      valores.push(hasta + " 23:59:59");
    }

    if (mesa) {
      condiciones.push(`mesa = $${idx++}`);
      valores.push(Number(mesa));
    }

    if (metodo_pago) {
      condiciones.push(`metodo_pago = $${idx++}`);
      valores.push(metodo_pago);
    }

    let query = `
      SELECT 
        id_pago,
        id_comanda,
        mesa,
        total_sin_propina,
        propina,
        total_pagado,
        metodo_pago,
        monto_entregado,
        cambio,
        pagado_en
      FROM caja_pagos
    `;

    if (condiciones.length > 0) {
      query += " WHERE " + condiciones.join(" AND ");
    }

    query += " ORDER BY pagado_en DESC";

    const limite = Number(limit) || 100;
    query += ` LIMIT ${limite}`;

    const result = await pool.query(query, valores);

    res.json(result.rows);
  } catch (err) {
    console.error("Error cargando historial:", err);
    res.status(500).json({
      error: "Error al cargar historial",
      detalle: err.message,
    });
  }
});

// 🔚 exportamos el router (lo que usa app.js)
module.exports = router;
