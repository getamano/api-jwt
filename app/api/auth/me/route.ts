import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: session.userId, email: session.email, role: session.role },
  });
}
