import { app } from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

let server;

async function startServer() {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    console.info(
      `${env.APP_NAME} API listening on port ${env.PORT}`,
    );
  });
}

async function shutdown(signal) {
  console.info(`${signal} received. Shutting down...`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
