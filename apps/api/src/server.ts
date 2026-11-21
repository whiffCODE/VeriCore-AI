
import "dotenv/config";

import app from "./app.js";
import { env } from "./config/env.js";

import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

import { verifyMailerConnection } from "./config/mailer.js";

// --------------------------------------------------
// Start server
// --------------------------------------------------

async function startServer(): Promise<void> {
  // 1. Connect to MongoDB.
  await connectDatabase();

  console.log("MongoDB connection established.");

  // 2. Verify Gmail SMTP connection.
  await verifyMailerConnection();

  // 3. Start Express server.
  const server = app.listen(env.PORT, () => {
    console.log(
      `VeriCore API running at http://localhost:${env.PORT}`,
    );

    console.log(`Environment: ${env.NODE_ENV}`);
  });

  // --------------------------------------------------
  // Graceful shutdown
  // --------------------------------------------------

  let isShuttingDown = false;

  const shutdown = (signal: string): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
      try {
        await disconnectDatabase();

        console.log("VeriCore API shutdown complete.");

        process.exit(0);
      } catch (error) {
        console.error("Shutdown failed:", error);

        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// --------------------------------------------------
// Application startup
// --------------------------------------------------

startServer().catch((error: unknown) => {
  console.error("Application startup failed:", error);

  process.exit(1);
});
