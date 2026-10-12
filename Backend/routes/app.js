import express from "express";
import { rateLimit } from "express-rate-limit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as adminController from "../Controllers/adminController.js";
import * as postController from "../Controllers/postController.js";
import * as userController from "../Controllers/userController.js";
import {
  auditStaffActivity,
  requireCustomer,
  requireManager,
  requireStaff,
  requireUser,
} from "../middleware/auth.js";

export const app = express();
app.use((_request, response, next) => {
  response.setHeader("Referrer-Policy", "no-referrer");
  return next();
});

const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.PG_MEM_TEST === "1" ? 100 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again in 15 minutes." },
});
const emailAuthenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.PG_MEM_TEST === "1" ? 100 : 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many email authentication requests. Please try again in 15 minutes." },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many order requests. Please try again in 15 minutes." },
});
const reservationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reservation requests. Please try again in 15 minutes." },
});
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many application submissions. Please try again later." },
});

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.post("/api/careers/applications", applicationLimiter, express.json({ limit: "7mb" }), postController.submitCareerApplication);
app.post("/api/paystack/webhook", express.raw({ type: "application/json", limit: "64kb" }), postController.processPaystackWebhook);
app.use(express.json({ limit: "32kb" }));

app.post("/api/auth/register", authenticationLimiter, userController.register);
app.post("/api/auth/login", authenticationLimiter, userController.login);
app.post("/api/auth/verify-email", emailAuthenticationLimiter, userController.verifyEmail);
app.post("/api/auth/resend-verification", emailAuthenticationLimiter, userController.resendVerification);
app.post("/api/auth/forgot-password", emailAuthenticationLimiter, userController.forgotPassword);
app.post("/api/auth/reset-password", emailAuthenticationLimiter, userController.resetPassword);
app.get("/api/auth/me", requireUser, userController.currentUser);
app.post("/api/auth/logout", userController.logout);

app.get("/api/health", adminController.healthCheck);
app.get("/api/menu", adminController.publicMenu);
app.post("/api/order-tracking", orderLimiter, postController.trackOrder);
app.post("/api/orders", orderLimiter, postController.createOrder);
app.post("/api/payments/verify", orderLimiter, postController.verifyPayment);
app.get("/api/reservation-availability", postController.reservationAvailability);
app.post("/api/bookings", reservationLimiter, requireUser, requireCustomer, postController.createBooking);
app.get("/api/customer/reservations", requireUser, requireCustomer, userController.customerReservations);

app.use("/api/staff", requireUser, requireStaff, auditStaffActivity);
app.use("/api/manager", requireUser, requireManager, auditStaffActivity);
app.get("/api/manager/summary", adminController.managerSummary);
app.get("/api/manager/activities", adminController.managerActivities);
app.get("/api/manager/staff", adminController.managerStaff);
app.get("/api/manager/applications", adminController.managerApplications);
app.get("/api/manager/applications/:id/resume", adminController.applicationResume);
app.post("/api/manager/staff", postController.createStaff);
app.patch("/api/manager/staff/:id", adminController.updateStaff);
app.get("/api/staff/summary", adminController.staffSummary);
app.get("/api/staff/tables", adminController.staffTables);
app.post("/api/staff/tables", postController.createTable);
app.patch("/api/staff/tables/:id", adminController.updateTable);
app.get("/api/staff/reservations", adminController.staffReservations);
app.patch("/api/staff/reservations/:id", adminController.updateReservation);
app.get("/api/staff/menu", adminController.staffMenu);
app.post("/api/staff/menu", postController.createMenuItem);
app.put("/api/staff/menu/:id", adminController.updateMenuItem);
app.patch("/api/staff/menu/:id", adminController.setMenuItemAvailability);
app.patch("/api/staff/menu/:id/stock", adminController.updateMenuStock);
app.get("/api/staff/orders", adminController.staffOrders);
app.patch("/api/staff/orders/:id", adminController.updateOrderStatus);

app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
app.use(express.static(frontendDist));
app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
  return response.sendFile(resolve(frontendDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Something went wrong on our side. Please try again." });
});
