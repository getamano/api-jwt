import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Verify the key belongs to this user (unless admin)
  if (session.role !== "admin") {
    const key = await db.collection("api_keys").findOne({ _id: id as any, userId: session.email });
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const usage = await db.collection("api_usage").aggregate([
    { $match: { keyId: id, timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          operationId: "$operationId",
          method: "$method",
          path: "$path",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": -1 } },
  ]).toArray();

  const total = await db.collection("api_usage").countDocuments({
    keyId: id,
    timestamp: { $gte: since },
  });

  return NextResponse.json({ keyId: id, days, total, usage });
}
