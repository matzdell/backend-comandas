// backend/routes/comandas.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

let io = null;

function setSocketInstance(socketIO) {
  io = socketIO;
  console.log('[COMANDAS] Socket.IO configurado');
}

// GET /api/comandas - Obtener todas las comandas
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.mesa,
        c.id_mesero,
        c.estado,
        c.creado_en,
        u.email as mesero_email
      FROM comandas c
      LEFT JOIN usuarios u ON c.id_mesero = u.id
      WHERE c.estado != 'PAGADA'
      ORDER BY c.creado_en DESC
    `);

    // Obtener detalles de cada comanda
    const comandasConDetalles = await Promise.all(
      result.rows.map(async (comanda) => {
        const detallesResult = await pool.query(`
          SELECT 
            dc.id,
            dc.id_producto,
            p.nombre as nombre_producto,
            dc.cantidad,
            dc.estado,
            dc.notas,
            dc.cliente_nro
          FROM detalle_comanda dc
          INNER JOIN productos p ON dc.id_producto = p.id
          WHERE dc.id_comanda = $1
          ORDER BY dc.id
        `, [comanda.id]);

        return {
          ...comanda,
          detalles: detallesResult.rows,
        };
      })
    );

    res.json(comandasConDetalles);
  } catch (error) {
    console.error('Error al obtener comandas:', error);
    res.status(500).json({ error: 'Error al obtener comandas' });
  }
});

// POST /api/comandas - Crear nueva comanda
router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { mesa, detalles, id_mesero } = req.body;

    console.log('[COMANDAS] Datos recibidos:', { mesa, detalles, id_mesero });

    // Validaciones
    if (!mesa) {
      throw new Error('El número de mesa es requerido');
    }

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      throw new Error('La comanda debe tener al menos un producto');
    }

    // Validar que cada detalle tenga los campos necesarios
    for (const detalle of detalles) {
      if (!detalle.id_producto || !detalle.cantidad) {
        throw new Error('Cada producto debe tener id_producto y cantidad');
      }
    }

    // Buscar si ya existe una comanda activa para esta mesa
    const comandaExistente = await client.query(`
      SELECT id FROM comandas
      WHERE mesa = $1 AND estado != 'PAGADA'
      ORDER BY creado_en DESC
      LIMIT 1
    `, [mesa]);

    let id_comanda;

    if (comandaExistente.rows.length > 0) {
      // Ya existe una comanda activa - usar esa
      id_comanda = comandaExistente.rows[0].id;
      console.log('[COMANDAS] Usando comanda existente:', id_comanda);
    } else {
      // Crear nueva comanda
      const comandaResult = await client.query(`
        INSERT INTO comandas (mesa, id_mesero, estado, creado_en)
        VALUES ($1, $2, 'PENDIENTE', NOW())
        RETURNING id
      `, [mesa, id_mesero || null]);

      id_comanda = comandaResult.rows[0].id;
      console.log('[COMANDAS] Nueva comanda creada:', id_comanda);
    }

    // Insertar detalles
    const detallesInsertados = [];
    
    for (const detalle of detalles) {
      const detalleResult = await client.query(`
        INSERT INTO detalle_comanda (
          id_comanda,
          id_producto,
          cantidad,
          estado,
          notas,
          cliente_nro
        ) VALUES ($1, $2, $3, 'PENDIENTE', $4, $5)
        RETURNING id
      `, [
        id_comanda,
        detalle.id_producto,
        detalle.cantidad,
        detalle.notas || '',
        detalle.cliente_nro || 1
      ]);

      detallesInsertados.push({
        id: detalleResult.rows[0].id,
        ...detalle,
      });
    }

    await client.query('COMMIT');

    // Obtener la comanda completa con productos
    const comandaCompleta = await pool.query(`
      SELECT 
        c.id,
        c.mesa,
        c.estado,
        c.creado_en,
        json_agg(
          json_build_object(
            'id', dc.id,
            'id_producto', dc.id_producto,
            'nombre', p.nombre,
            'cantidad', dc.cantidad,
            'notas', dc.notas,
            'cliente_nro', dc.cliente_nro,
            'estado', dc.estado
          )
        ) as detalles
      FROM comandas c
      INNER JOIN detalle_comanda dc ON c.id = dc.id_comanda
      INNER JOIN productos p ON dc.id_producto = p.id
      WHERE c.id = $1
      GROUP BY c.id, c.mesa, c.estado, c.creado_en
    `, [id_comanda]);

    // Emitir evento Socket.IO para cocina
    if (io) {
      io.emit('nueva_comanda', comandaCompleta.rows[0]);
      console.log('[COMANDAS] Evento emitido a cocina');
    }

    res.status(201).json({
      message: 'Comanda creada exitosamente',
      comanda: comandaCompleta.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear comanda:', error);
    res.status(400).json({ error: error.message || 'Error al crear comanda' });
  } finally {
    client.release();
  }
});

// PATCH /api/comandas/:id/estado - Actualizar estado de comanda completa
router.patch('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'PAGADA'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    await pool.query(`
      UPDATE comandas
      SET estado = $1
      WHERE id = $2
    `, [estado, id]);

    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error al actualizar estado de comanda:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// PATCH /api/comandas/detalle/:id/estado - Actualizar estado de un item específico
router.patch('/detalle/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['PENDIENTE', 'EN_PREPARACION', 'LISTO'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    await pool.query(`
      UPDATE detalle_comanda
      SET estado = $1
      WHERE id = $2
    `, [estado, id]);

    // Verificar si todos los items de la comanda están listos
    const detalleResult = await pool.query(`
      SELECT id_comanda FROM detalle_comanda WHERE id = $1
    `, [id]);

    if (detalleResult.rows.length > 0) {
      const idComanda = detalleResult.rows[0].id_comanda;

      const todosListos = await pool.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN estado = 'LISTO' THEN 1 ELSE 0 END) as listos
        FROM detalle_comanda
        WHERE id_comanda = $1
      `, [idComanda]);

      const { total, listos } = todosListos.rows[0];

      if (parseInt(total) === parseInt(listos)) {
        // Todos los items están listos, actualizar comanda
        await pool.query(`
          UPDATE comandas
          SET estado = 'LISTO'
          WHERE id = $1
        `, [idComanda]);
      }
    }

    res.json({ message: 'Estado del item actualizado' });
  } catch (error) {
    console.error('Error al actualizar estado del detalle:', error);
    res.status(500).json({ error: 'Error al actualizar estado del item' });
  }
});

// DELETE /api/comandas/:id - Eliminar comanda
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Eliminar detalles
    await client.query(`
      DELETE FROM detalle_comanda WHERE id_comanda = $1
    `, [id]);

    // Eliminar comanda
    await client.query(`
      DELETE FROM comandas WHERE id = $1
    `, [id]);

    await client.query('COMMIT');

    res.json({ message: 'Comanda eliminada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar comanda:', error);
    res.status(500).json({ error: 'Error al eliminar comanda' });
  } finally {
    client.release();
  }
});

module.exports = {
  router,
  setSocketInstance,
};
