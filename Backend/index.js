import "dotenv/config";
import { app } from "./routes/app.js";
import { db } from "./database/database.js";
import { ensureManagerAccount } from "./services/manager-bootstrap.js";
import { checkEmailConfiguration } from "./services/order-notifications.js";

const port = Number(process.env.PORT) || 4000;
try {
  const managerCreated = await ensureManagerAccount();
  if (managerCreated) console.info("Created the initial manager account from the configured ADMIN_* variables.");
  app.listen(port, () => {
    console.log(`Restaurant API listening on http://localhost:${port}`);
    checkEmailConfiguration().catch((error) => console.error("[email] Startup check failed:", error.message));
  });
} catch (error) {
  console.error(`Startup blocked while creating the initial manager account: ${error.message}`);
  await db.close();
  process.exitCode = 1;
}
