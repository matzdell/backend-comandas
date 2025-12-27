// backend/routes/productos.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/productos - Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.id_categoria,
        c.nombre as categoria,
        p.precio,
        p.disponible
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      ORDER BY c.nombre, p.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/categorias - Obtener todas las categorías
router.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nombre
      FROM categorias
      ORDER BY nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// GET /api/productos/:id - Obtener un producto específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.id_categoria,
        c.nombre as categoria,
        p.precio,
        p.disponible
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// POST /api/productos - Crear producto (Admin)
router.post('/', async (req, res) => {
  try {
    const { nombre, id_categoria, precio, disponible } = req.body;
    
    const result = await pool.query(`
      INSERT INTO productos (nombre, id_categoria, precio, disponible)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [nombre, id_categoria, precio, disponible ?? true]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/productos/:id - Actualizar producto (Admin)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, id_categoria, precio, disponible } = req.body;
    
    const result = await pool.query(`
      UPDATE productos
      SET nombre = $1, id_categoria = $2, precio = $3, disponible = $4
      WHERE id = $5
      RETURNING *
    `, [nombre, id_categoria, precio, disponible, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/productos/:id - Eliminar producto (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM productos
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({ message: 'Producto eliminado', producto: result.rows[0] });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;
