import {PrismaClient} from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "info", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let dbConnected = false;

export async function connectDb(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
      return;
    } catch {
      dbConnected = false;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  // Do not throw: database-dependent routes return 503 until connectivity recovers.
}

export function isDbConnected(): boolean {
  return dbConnected;
}

export async function disconnectDb(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  dbConnected = false;
}
