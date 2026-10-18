import express from "express";
import { rateLimit } from "express-rate-limit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as adminController from "../Controllers/adminController.js";
import * as engagementController from "../Controllers/engagementController.js";
import * as postController from "../Controllers/postController.js";
import * as userController from "../Controllers/userController.js";
import {
  auditStaffActivity,
  optionalUser,
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
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many feedback submissions. Please try again later." },
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
app.get("/api/restaurant-options", engagementController.restaurantOptions);
app.post("/api/order-tracking", orderLimiter, postController.trackOrder);
app.post("/api/order-feedback", feedbackLimiter, postController.submitOrderFeedback);
app.post("/api/orders", orderLimiter, optionalUser, postController.createOrder);
app.post("/api/payments/verify", orderLimiter, postController.verifyPayment);
app.get("/api/reservation-availability", postController.reservationAvailability);
app.post("/api/bookings", reservationLimiter, requireUser, requireCustomer, postController.createBooking);
app.get("/api/customer/reservations", requireUser, requireCustomer, userController.customerReservations);
app.get("/api/customer/engagement", requireUser, requireCustomer, engagementController.customerEngagement);
app.get("/api/customer/favorites", requireUser, requireCustomer, engagementController.customerFavorites);
app.post("/api/customer/favorites/:menuItemId", requireUser, requireCustomer, engagementController.addCustomerFavorite);
app.delete("/api/customer/favorites/:menuItemId", requireUser, requireCustomer, engagementController.removeCustomerFavorite);
app.get("/api/customer/orders", requireUser, requireCustomer, engagementController.customerOrderHistory);

app.use("/api/staff", requireUser, requireStaff, auditStaffActivity);
app.use("/api/manager", requireUser, requireManager, auditStaffActivity);
app.get("/api/manager/summary", adminController.managerSummary);
app.get("/api/manager/activities", adminController.managerActivities);
app.get("/api/manager/staff", adminController.managerStaff);
app.get("/api/manager/applications", adminController.managerApplications);
app.get("/api/manager/delivery-areas", engagementController.managerDeliveryAreas);
app.post("/api/manager/delivery-areas", engagementController.createDeliveryArea);
app.patch("/api/manager/delivery-areas/:id", engagementController.updateDeliveryArea);
app.get("/api/manager/deals", engagementController.managerDeals);
app.post("/api/manager/deals", engagementController.createDeal);
app.patch("/api/manager/deals/:id", engagementController.updateDealStatus);
app.get("/api/manager/meal-bundles", engagementController.managerMealBundles);
app.post("/api/manager/meal-bundles", engagementController.createMealBundle);
app.patch("/api/manager/meal-bundles/:id", engagementController.updateMealBundleStatus);
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
app.get("/api/staff/feedback", adminController.staffFeedback);
app.get("/api/staff/announcements", adminController.staffAnnouncements);
app.post("/api/staff/announcements", adminController.createStaffAnnouncement);
app.patch("/api/staff/announcements/:id/read", adminController.markStaffAnnouncementRead);

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
