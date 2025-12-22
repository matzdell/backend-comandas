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
// ✅ SOLO ORIGINS (sin /login, sin rutas)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://matzdell-frontend-comandas-gfuw79c92-matzdells-projects.vercel.app",
];

// ✅ Permite también previews de Vercel de TU proyecto (opcional, pero útil)
function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman/curl

  if (allowedOrigins.includes(origin)) return true;

  // Permitir previews del MISMO proyecto:
  // https://matzdell-frontend-comandas-xxxxx.vercel.app
  if (origin.endsWith(".vercel.app") && origin.includes("matzdell-frontend-comandas")) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);

    console.log("CORS bloqueado para origen:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ✅ PRE-FLIGHT seguro (en vez de "*")
app.options(/.*/, cors(corsOptions));

// Render / proxies
app.set("trust proxy", 1);

// ======================= Rutas ==========================

// Healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Backend Comandas funcionando" });
});

// ---------- Rutas públicas ----------
app.use("/api/auth", authRoutes);

// ---------- Rutas ADMIN (solo Jefe) ----------
if (typeof adminRoutes === "function") {
  app.use("/api/admin", authRequired, roleRequired(["Jefe"]), adminRoutes);
} else if (adminRoutes && adminRoutes.router && typeof adminRoutes.router === "function") {
  app.use("/api/admin", authRequired, roleRequired(["Jefe"]), adminRoutes.router);
}

// ---------- Productos ----------
if (productosModule) {
  if (typeof productosModule === "function") {
    app.use("/api/productos", productosModule);
  } else if (productosModule.router && typeof productosModule.router === "function") {
    app.use("/api/productos", productosModule.router);
  }
}

// ---------- Comandas ----------
if (comandasModule && comandasModule.router && typeof comandasModule.router === "function") {
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
