import { app } from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

let server;
let isShuttingDown = false;

async function startServer() {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    console.info(
      `${env.APP_NAME} API listening on port ${env.PORT}`,
    );
  });

  server.on("error", (error) => {
    console.error("HTTP server error:", error.message);
    process.exitCode = 1;
  });
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`${signal} received. Shutting down gracefully...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    await disconnectDatabase();

    console.info("Server shutdown completed.");
    process.exitCode = 0;
  } catch (error) {
    console.error("Shutdown failed:", error.message);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

startServer().catch(async (error) => {
  console.error("Server startup failed:", error.message);

  try {
    await disconnectDatabase();
  } catch (shutdownError) {
    console.error(
      "Database cleanup failed:",
      shutdownError.message,
    );
  }

  process.exitCode = 1;
});

