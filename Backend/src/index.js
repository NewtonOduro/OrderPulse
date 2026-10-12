import "dotenv/config";
import { app } from "./app.js";
import { db } from "./database.js";
import { ensureManagerAccount } from "./manager-bootstrap.js";

const port = Number(process.env.PORT) || 4000;
try {
  const managerCreated = await ensureManagerAccount();
  if (managerCreated) console.info("Created the initial manager account from the configured ADMIN_* variables.");
  app.listen(port, () => {
    console.log(`Restaurant API listening on http://localhost:${port}`);
  });
} catch (error) {
  console.error(`Startup blocked while creating the initial manager account: ${error.message}`);
  await db.close();
  process.exitCode = 1;
}
