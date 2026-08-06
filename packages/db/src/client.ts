import { PrismaD1 } from "@prisma/adapter-d1"
import { PrismaClient } from "./generated/prisma/client"

export function createPrismaClient(database: D1Database) {
  const adapter = new PrismaD1(database)
  const client = new PrismaClient({ adapter })

  // D1 rejects Prisma's interactive transaction callback. Keep the service
  // boundary intact and execute those callbacks sequentially; D1 constraints
  // and idempotency keys enforce the concurrent write invariants.
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (input: unknown, options?: unknown) => {
          if (typeof input === "function") return input(receiver)
          return target.$transaction(input as never, options as never)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

export type ScoutyPrismaClient = ReturnType<typeof createPrismaClient>
