import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUsage, getLimits } from "@/lib/usage";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const usage = await getUsage(user.keyId);
    const limits = getLimits(user.tier);

    return NextResponse.json({
      email: user.email,
      tier: user.tier,
      limits,
      rateLimit: {
        remaining: request.headers.get("x-ratelimit-remaining"),
      },
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
