import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { keyId, userId, tier, operationId, method, path, statusCode } =
      await request.json();

    const db = await getDb();
    await db.collection("api_usage").insertOne({
      keyId,
      userId,
      tier,
      operationId,
      method,
      path,
      statusCode,
      timestamp: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
