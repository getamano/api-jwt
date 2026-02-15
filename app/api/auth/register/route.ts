import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/users";
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

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await registerUser(email, password);
    const response = NextResponse.json(
      { id: user._id, email: user.email, role: user.role },
      { status: 201 }
    );
    response.headers.set("Set-Cookie", createSessionCookie(user));
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Email already registered" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
