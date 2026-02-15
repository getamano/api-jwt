import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export interface SessionPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
}

const COOKIE_NAME = "session";

function getSecret(): string {
  return process.env.JWT_SECRET || process.env.APIM_SHARED_SECRET || "fallback-dev-secret";
}

export function createSessionCookie(user: {
  _id: string;
  email: string;
  role: "user" | "admin";
}): string {
  const token = jwt.sign(
    { userId: user._id, email: user.email, role: user.role } satisfies SessionPayload,
    getSecret(),
    { expiresIn: "7d" }
  );
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

export function getSession(request: NextRequest): SessionPayload | null {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) return null;

  try {
    return jwt.verify(cookie.value, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
