// app.js
require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const comandasModule = require("./routes/comandas");   // { router, setSocketInstance }
const productosModule = require("./routes/productos"); // router o { router }
const cajaRoutes = require("./routes/caja");           // router
const { authRequired, roleRequired } = require("./middleware/auth");

const app = express();

app.use(express.json());
app.use(cookieParser());

// ======================= CORS ==========================
const allowedOrigins = [
  "http://localhost:3000",                  // CRA local
  "http://localhost:5173",                  // Vite local (por si acaso)
  "https://frontend-comandas-coral.vercel.app", // tu front en Vercel
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Peticiones sin Origin (Postman, curl) -> permitir
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("CORS bloqueado para origen:", origin);
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true, // permite cookies (para httpOnly, etc.)
  })
);

// Render / proxies
app.set("trust proxy", 1); // muy recomendable en Render para cookies seguras

// ======================= Rutas ==========================

// Ruta simple de prueba/healthcheck (opcional pero útil)
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Backend Comandas funcionando" });
});

// ---------- Rutas públicas ----------
app.use("/api/auth", authRoutes);

// ---------- Rutas ADMIN (solo Jefe) ----------
if (typeof adminRoutes === "function") {
  app.use("/api/admin", authRequired, roleRequired(["Jefe"]), adminRoutes);
} else if (
  adminRoutes &&
  adminRoutes.router &&
  typeof adminRoutes.router === "function"
) {
  app.use(
    "/api/admin",
    authRequired,
    roleRequired(["Jefe"]),
    adminRoutes.router
  );
}

// ---------- Productos ----------
if (productosModule) {
  if (typeof productosModule === "function") {
    // exporta directamente un router
    app.use("/api/productos", productosModule);
  } else if (
    productosModule.router &&
    typeof productosModule.router === "function"
  ) {
    // exporta { router }
    app.use("/api/productos", productosModule.router);
  }
}

// ---------- Comandas ----------
if (
  comandasModule &&
  comandasModule.router &&
  typeof comandasModule.router === "function"
) {
  app.use(
    "/api/comandas",
    authRequired,
    roleRequired(["Mesero", "Jefe"]),
    comandasModule.router
  );
}

// ---------- Caja (Cajero / Jefe) ----------
if (cajaRoutes && typeof cajaRoutes === "function") {
  app.use(
    "/api/caja",
    authRequired,
    roleRequired(["Cajero", "Jefe"]),
    cajaRoutes
  );
}

// ---------- Cocina (solo test / ejemplo) ----------
app.use(
  "/api/cocina",
  authRequired,
  roleRequired(["Cocinero", "Jefe"]),
  (req, res) => res.json({ ok: true })
);

module.exports = app;
