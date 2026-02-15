import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/users";
import { createSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await loginUser(email, password);
    const response = NextResponse.json({
      id: user._id,
      email: user.email,
      role: user.role,
    });
    response.headers.set("Set-Cookie", createSessionCookie(user));
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Invalid email or password" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
