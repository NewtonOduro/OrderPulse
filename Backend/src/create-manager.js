import "dotenv/config";
import { db } from "./database.js";
import { createManagerAccount } from "./manager-bootstrap.js";

try {
  const email = await createManagerAccount();
  console.log(`Manager account created for ${email}. Remove ADMIN_PASSWORD from the environment after setup.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
