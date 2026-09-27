import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./lib/env.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerChatRoutes } from "./routes/chat.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(jwt, { secret: env.JWT_SECRET });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({ ok: true, service: "tixly-api" }));

  app.setErrorHandler((err: unknown, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: err.issues[0]?.message ?? "Invalid request",
      });
    }
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    const message =
      err instanceof Error ? err.message : "Request failed";
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: message });
    }
    request.log.error(err);
    return reply.status(500).send({ error: "Internal server error" });
  });

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerTicketRoutes(app);
  await registerChatRoutes(app);

  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
