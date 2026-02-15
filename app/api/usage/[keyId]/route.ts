import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUsage, getLimits } from "@/lib/usage";
import { getDb } from "@/lib/db";
import { ApiKeyDoc } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { keyId } = await params;

  // Verify the key exists and the user owns it (or is admin)
  const db = await getDb();
  const key = await db.collection<ApiKeyDoc>("api_keys").findOne({ _id: keyId });
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  if (session.role !== "admin" && key.userId !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const usage = await getUsage(keyId);
  const limits = getLimits(key.tier);

  return NextResponse.json({
    keyId,
    limits,
    usage: usage
      ? {
          totalCalls: usage.totalCalls,
          callsThisMinute: usage.callsThisMinute,
          callsThisMonth: usage.callsThisMonth,
          lastCallAt: usage.lastCallAt,
          history: usage.history,
        }
      : {
          totalCalls: 0,
          callsThisMinute: 0,
          callsThisMonth: 0,
          lastCallAt: null,
          history: [],
        },
  });
}
