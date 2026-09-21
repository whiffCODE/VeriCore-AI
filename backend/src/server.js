import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase
} from "./config/db.js";

async function bootstrap() {
  await connectDatabase();

  app.listen(
    env.PORT,
    () => {
      console.log(
        `VeriCore AI API running on http://localhost:${env.PORT}`
      );
    }
  );
}

bootstrap().catch((error) => {
  console.error(
    "Server startup failed:",
    error
  );

  process.exit(1);
});