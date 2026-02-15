import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { trackCall } from "@/lib/usage";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    await trackCall(user.keyId, user.tier);

    return NextResponse.json({
      message: "You have access to protected data",
      user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
