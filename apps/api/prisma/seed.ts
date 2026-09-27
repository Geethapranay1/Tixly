import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function upsertUser(data: {
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  team?: string;
  password?: string;
}) {
  const passwordHash = data.password
    ? await bcrypt.hash(data.password, 10)
    : undefined;

  return prisma.user.upsert({
    where: { email: data.email },
    create: {
      email: data.email,
      name: data.name,
      role: data.role,
      team: data.team,
      passwordHash,
    },
    update: {
      name: data.name,
      role: data.role,
      team: data.team,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: "admin@tixly.demo",
    name: "Tixly Admin",
    role: "ADMIN",
    password: "DemoAdmin123!",
  });

  const priya = await upsertUser({
    email: "priya@tixly.demo",
    name: "Priya",
    role: "MEMBER",
    team: "Backend",
  });
  const amit = await upsertUser({
    email: "amit@tixly.demo",
    name: "Amit",
    role: "MEMBER",
    team: "Frontend",
  });
  await upsertUser({
    email: "rahul.sharma@tixly.demo",
    name: "Rahul Sharma",
    role: "MEMBER",
    team: "Backend",
  });
  await upsertUser({
    email: "rahul.verma@tixly.demo",
    name: "Rahul Verma",
    role: "MEMBER",
    team: "Frontend",
  });

  const existing = await prisma.ticket.count();
  if (existing === 0) {
    await prisma.ticket.createMany({
      data: [
        {
          title: "Checkout page throwing 500 errors",
          description: "Seeded sample ticket",
          assigneeId: priya.id,
          dueDate: new Date("2026-09-25"),
          priority: "HIGH",
          status: "OPEN",
          tags: ["checkout", "prod"],
          language: "en",
          creationSource: "CHAT",
        },
        {
          title: "Search results are wrong",
          description: "Seeded sample ticket",
          assigneeId: amit.id,
          dueDate: new Date("2026-09-27"),
          priority: "MEDIUM",
          status: "IN_PROGRESS",
          tags: ["search"],
          language: "en",
          creationSource: "CHAT",
        },
        {
          title: "Payment page slow",
          description: "Seeded sample ticket",
          assigneeId: amit.id,
          dueDate: new Date("2026-10-04"),
          priority: "MEDIUM",
          status: "RESOLVED",
          tags: ["performance"],
          language: "hi",
          creationSource: "CHAT",
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log("Admin:", admin.email, "/ DemoAdmin123!");
  console.log("Members: Priya, Amit, Rahul Sharma, Rahul Verma");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
