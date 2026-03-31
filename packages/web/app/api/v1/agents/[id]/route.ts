import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAgentById } from "@/lib/agent-auth";
import {
  deleteRegisteredAgent,
  getRegisteredAgent,
  updateRegisteredAgent,
} from "@/lib/services/AgentService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await authenticateAgentById(request, id);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const agent = await getRegisteredAgent(prisma, id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await authenticateAgentById(request, id);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    displayName,
    avatarUrl,
    capabilities,
    healthUrl,
    webhookUrl,
    maxTokensSec,
  } = body as {
    displayName?: string;
    avatarUrl?: string;
    capabilities?: string[];
    healthUrl?: string;
    webhookUrl?: string;
    maxTokensSec?: number;
  };

  try {
    await updateRegisteredAgent(prisma, {
      id,
      displayName,
      avatarUrl,
      capabilities,
      healthUrl,
      webhookUrl,
      maxTokensSec,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[v1/agents] Agent update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await authenticateAgentById(request, id);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await deleteRegisteredAgent(prisma, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[v1/agents] Agent deregistration failed:", error);
    return NextResponse.json(
      { error: "Deregistration failed" },
      { status: 500 },
    );
  }
}
