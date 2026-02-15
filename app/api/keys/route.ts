import { NextRequest, NextResponse } from "next/server";
import {
  createApiKey,
  deleteKey,
  listKeys,
  listKeysByEmail,
  revokeKey,
  updateKeyTier,
  Tier,
} from "@/lib/auth";
import { getSession } from "@/lib/session";

function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();

  try {
    const { email, tier, name = "Default", expiresAt } =
      await request.json();

    // Non-admin users can only create keys for themselves
    const targetEmail =
      session.role === "admin" && email ? email : session.email;

    // Only admin can pick a tier; users always get starter
    let resolvedTier: Tier = "starter";
    if (session.role === "admin" && tier) {
      const validTiers: Tier[] = ["starter", "unlimited"];
      if (!validTiers.includes(tier)) {
        return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
      }
      resolvedTier = tier;
    }

    const { key, meta } = await createApiKey(
      targetEmail,
      resolvedTier,
      name,
      expiresAt ? new Date(expiresAt) : undefined
    );

    return NextResponse.json({ apiKey: key, ...meta }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();

  try {
    const keys =
      session.role === "admin"
        ? await listKeys()
        : await listKeysByEmail(session.email);
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();

  try {
    const { id, tier } = await request.json();
    if (!id || !tier) {
      return NextResponse.json(
        { error: "id and tier are required" },
        { status: 400 }
      );
    }

    const validTiers: Tier[] = ["starter", "unlimited"];
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const updated = await updateKeyTier(id, tier);
    if (!updated) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Admin revokes (soft-delete); users delete (hard-delete)
    const success =
      session.role === "admin"
        ? await revokeKey(id)
        : await deleteKey(id, session.email);

    if (!success) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
