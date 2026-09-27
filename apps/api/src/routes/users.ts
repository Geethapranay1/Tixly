import type { FastifyInstance } from "fastify";
import { CreateUserBodySchema } from "@tixly/shared";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "./auth.js";

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      where: { role: "MEMBER" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        team: true,
        role: true,
        createdAt: true,
      },
    });
    return { users };
  });

  app.post("/api/users", { preHandler: requireAdmin }, async (req, reply) => {
    const body = CreateUserBodySchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return reply.status(409).send({ error: "Email already exists" });
    }
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        team: body.team,
        role: "MEMBER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        team: true,
        role: true,
        createdAt: true,
      },
    });
    return { user };
  });
}
