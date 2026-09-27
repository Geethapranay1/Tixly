import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LoginBodySchema } from "@tixly/shared";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (req, reply) => {
    const body = LoginBodySchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash || user.role !== "ADMIN") {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  });
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await req.jwtVerify();
    const payload = req.user as { role?: string };
    if (payload.role !== "ADMIN") {
      return reply.status(403).send({ error: "Forbidden" });
    }
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}
