import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";

/**
 * DELETE /api/servers/[serverId]/invites/[inviteId] — Revoke an invite
 * Auth: MANAGE_SERVER permission
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ serverId: string; inviteId: string }> },
) {
  const { serverId, inviteId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const check = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.MANAGE_SERVER,
  );
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Missing permission: Manage Server" },
      { status: 403 },
    );
  }

  const invite = await prisma.invite.findUnique({
    where: { id: inviteId },
    select: { id: true, serverId: true },
  });

  if (!invite || invite.serverId !== serverId) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  await prisma.invite.delete({
    where: { id: inviteId },
  });

  return NextResponse.json({ success: true });
}
