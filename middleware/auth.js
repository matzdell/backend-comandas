const jwt = require('jsonwebtoken');

// ✅ Enviar cookie con token (para navegador)
function sendAuthCookie(res, payload) {
  const isProd = process.env.SECURE_COOKIES === 'true';

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });

  // En producción (Render, HTTPS): SameSite=None + Secure
  // En local: Lax + sin Secure
  const sameSite = isProd ? 'none' : 'lax';

  res.cookie('token', token, {
    httpOnly: true,
    sameSite,       // 'none' en Render, 'lax' en local
    secure: isProd, // true en Render, false en localhost
    path: '/',
  });
}

// ✅ Limpiar cookie de sesión
function clearAuthCookie(res) {
  const isProd = process.env.SECURE_COOKIES === 'true';
  const sameSite = isProd ? 'none' : 'lax';

  res.clearCookie('token', {
    httpOnly: true,
    sameSite,
    secure: isProd,
    path: '/',
  });
}

function authRequired(req, res, next) {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function roleRequired(rolesPermitidos = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const userRole = req.user.role?.toLowerCase();
    const rolesLower = rolesPermitidos.map((r) => r.toLowerCase());

    if (!rolesLower.includes(userRole)) {
      return res.status(403).json({ error: 'Rol no reconocidaaao' });
    }
    next();
  };
}

module.exports = {
  authRequired,
  roleRequired,
  sendAuthCookie,
  clearAuthCookie,
};
