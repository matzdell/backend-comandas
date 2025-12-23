// index.js
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const productosRoutes = require('./routes/productos');
const comandasModule = require('./routes/comandas');
const cajaRoutes = require('./routes/caja'); // para usar obtenerTotalesMesas()
const kpiRoutes = require('./routes/kpi.routes');

const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Pasar instancia IO a router de comandas (para KDS, etc.)
if (comandasModule.setSocketInstance) {
  comandasModule.setSocketInstance(io);
}

// Rutas API
app.use('/api/productos', productosRoutes);
app.use('/api/comandas', comandasModule.router);
app.use('/api/kpi', kpiRoutes);
// OJO: la ruta /api/caja debe estar montada en app.js (app.use('/api/caja', cajaRoutes))

// Salud
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Test manual de nueva_comanda (para KDS)
app.get('/api/emit-test', (_req, res) => {
  const sample = {
    id_comanda: 999,
    mesa: 'TEST',
    detalles: [{ nombre: 'Prueba', cantidad: 1, cliente_nro: 1, notas: 'OK' }],
  };
  io.emit('nueva_comanda', sample);
  res.json({ ok: true });
});

// ======================= SOCKETS ==========================
io.on('connection', (socket) => {
  console.log('[SOCKET] cliente conectado', socket.id);

  let cajaInterval = null;

  // 👉 Caja se suscribe a los totales de mesas
  socket.on('caja_suscribirse_totales', async () => {
    console.log('[SOCKET] caja_suscribirse_totales desde', socket.id);
    try {
      const totales = await cajaRoutes.obtenerTotalesMesas();
      console.log('[SOCKET] primeros totales caja:', totales);
      socket.emit('caja_totales', totales);

      // Refresco periódico (cada 5 segundos)
      if (!cajaInterval) {
        cajaInterval = setInterval(async () => {
          try {
            const nuevosTotales = await cajaRoutes.obtenerTotalesMesas();
            socket.emit('caja_totales', nuevosTotales);
          } catch (err) {
            console.error('Error en intervalo de totales de caja:', err);
          }
        }, 5000);
      }
    } catch (err) {
      console.error('Error obteniendo totales de caja:', err);
    }
  });

  socket.on('caja_desuscribirse_totales', () => {
    console.log('[SOCKET] caja_desuscribirse_totales desde', socket.id);
    if (cajaInterval) {
      clearInterval(cajaInterval);
      cajaInterval = null;
    }
  });

  socket.on('disconnect', (reason) => {
    if (cajaInterval) {
      clearInterval(cajaInterval);
      cajaInterval = null;
    }
    console.log('[SOCKET] cliente desconectado', socket.id, reason);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend escuchando en todas las interfaces en puerto ${PORT}`);
});
