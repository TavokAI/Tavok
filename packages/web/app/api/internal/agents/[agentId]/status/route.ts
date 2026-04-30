import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateInternalSecret } from "@/lib/internal-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const registration = await prisma.agentRegistration.findUnique({
    where: { agentId },
    select: {
      capabilities: true,
      isGuest: true,
      expiresAt: true,
      revokedAt: true,
      agent: {
        select: {
          id: true,
          isActive: true,
        },
      },
    },
  });

  if (!registration) {
    return NextResponse.json(
      { valid: false, error: "Agent registration not found" },
      { status: 404 },
    );
  }

  if (!registration.agent.isActive) {
    return NextResponse.json(
      { valid: false, error: "Agent is inactive" },
      { status: 403 },
    );
  }

  if (registration.revokedAt) {
    return NextResponse.json(
      { valid: false, error: "Agent registration is revoked" },
      { status: 403 },
    );
  }

  if (registration.expiresAt && registration.expiresAt <= new Date()) {
    return NextResponse.json(
      { valid: false, error: "Agent registration is expired" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    valid: true,
    agentId: registration.agent.id,
    capabilities: registration.capabilities ?? [],
    isGuest: registration.isGuest,
    expiresAt: registration.expiresAt?.toISOString() ?? null,
    revokedAt: null,
  });
}
