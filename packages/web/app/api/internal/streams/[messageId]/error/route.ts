import { prisma } from "@/lib/db";
import { createInternalStreamErrorHandler } from "@/lib/route-handlers";

export const POST = createInternalStreamErrorHandler({ prismaClient: prisma });
