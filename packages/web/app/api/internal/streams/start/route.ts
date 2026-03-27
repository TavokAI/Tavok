import { prisma } from "@/lib/db";
import { createInternalStreamStartHandler } from "@/lib/route-handlers";

export const POST = createInternalStreamStartHandler({ prismaClient: prisma });
