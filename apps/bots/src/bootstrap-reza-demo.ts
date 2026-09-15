/** Runs after deployment to reconcile the one active customer demo, Reza Hosseini. */
import { createDb } from "@arayeshgar/db";
import { ensurePlatformAdmins, getEnv, logger, parseAdminIds } from "@arayeshgar/core";
import { reconcileRezaDemo } from "./reza-demo";

async function main() {
  const env = getEnv();
  const db = createDb(env.DATABASE_URL);
  // Guarantees the configured owner is present before finding all active admin chats.
  await ensurePlatformAdmins(db, parseAdminIds(env.ADMIN_IDS));
  const result = await reconcileRezaDemo(db);
  logger.info(result, "Reza demo reconciliation complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: String(err) }, "Reza demo reconciliation failed");
    process.exit(1);
  });
