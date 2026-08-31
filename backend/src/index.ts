import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import { prisma } from "./utils/prisma";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/authRoutes";
import customerRoutes from "./routes/customerRoutes";
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes";
import serviceRoutes from "./routes/serviceRoutes";
import servicePackageRoutes from "./routes/servicePackageRoutes";
import bayRoutes from "./routes/bayRoutes";
import userRoutes from "./routes/userRoutes";
import bookingRoutes from "./routes/bookingRoutes";
import jobCardRoutes from "./routes/jobCardRoutes";
import damageInspectionRoutes from "./routes/damageInspectionRoutes";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5180" }));
app.use(express.json());

// Static file serving for locally-uploaded photos/slips (dev only — see
// README "Next steps for production" for swapping this for S3/Supabase).
app.use("/uploads", express.static(path.join(__dirname, "..", process.env.UPLOAD_DIR ?? "uploads")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(500).json({ status: "error", db: "unreachable" });
  }
});

app.use("/auth", authRoutes);
app.use("/customers", customerRoutes);
app.use("/service-categories", serviceCategoryRoutes);
app.use("/services", serviceRoutes);
app.use("/service-packages", servicePackageRoutes);
app.use("/bays", bayRoutes);
app.use("/users", userRoutes);
app.use("/bookings", bookingRoutes);
app.use("/job-cards", jobCardRoutes);
app.use("/damage-inspections", damageInspectionRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
