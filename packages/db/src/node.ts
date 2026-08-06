import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma-node/client"

export function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

export type ScoutyPrismaClient = ReturnType<typeof createPrismaClient>

export * from "./generated/prisma-node/client"
