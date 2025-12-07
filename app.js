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

// CORS dev: permite cookies y cualquier origin (localhost / IP LAN)
app.use(
  cors({
    origin: true,       // hace echo del Origin que llega
    credentials: true,  // permite cookies
  })
);

// y OJO:
app.set('trust proxy', 1); // muy recomendable en Render

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
  app.use("/api/admin", authRequired, roleRequired(["Jefe"]), adminRoutes.router);
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
