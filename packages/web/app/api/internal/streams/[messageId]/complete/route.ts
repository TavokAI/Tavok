import { prisma } from "@/lib/db";
import { createInternalStreamCompleteHandler } from "@/lib/route-handlers";

export const POST = createInternalStreamCompleteHandler({
  prismaClient: prisma,
});
