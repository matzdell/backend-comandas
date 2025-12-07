// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendAuthCookie } = require('../middleware/auth');

const router = express.Router();

/**
 * Solo para pruebas: genera un hash de contraseña
 */
router.post('/dev/hash', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Falta la contraseña' });
  const hash = await bcrypt.hash(password, 12);
  res.json({ hash });
});

/**
 * LOGIN: POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    const query = `
      SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.nombre AS role
      FROM usuarios u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1
      LIMIT 1
    `;

    const { rows } = await db.query(query, [email]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Usuario no existe' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    // Payload que se guardará en el token y se usará en req.user
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,   // lo usa roleRequired(['Mesero','Jefe',...])
      nombre: user.nombre,
    };

    // Generamos JWT para la app móvil
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '12h',
    });

    // Cookie httpOnly con JWT (panel web)
    sendAuthCookie(res, payload);

    // 👇 Respuesta compatible con web y móvil:
    // - web puede seguir usando id, email, role directamente
    // - móvil puede usar data.user.id, data.token, etc.
    res.json({
      ok: true,
      token,
      ...payload,
      user: payload,
    });
  } catch (err) {
    console.error('Error en /api/auth/login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * /api/auth/me
 * Devuelve el usuario actual leyendo la cookie "token"
 * Usado por tu AuthContext en el panel web
 */
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json(decoded);
  } catch (err) {
    console.error('Error verificando token en /me:', err);
    res.json(null);
  }
});

/**
 * LOGOUT: borra cookie de sesión
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: false,
    sameSite: 'none',
    path: '/',
  });
  res.json({ ok: true });
});

module.exports = router;
