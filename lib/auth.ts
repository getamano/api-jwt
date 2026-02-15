import { NextRequest } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { getOrCreateSubscription } from "./apim";
import { encrypt, decrypt } from "./crypto";

export type Tier = "starter" | "unlimited";

const APIM_SHARED_SECRET = process.env.APIM_SHARED_SECRET!;

export interface RequestIdentity {
  keyId: string;
  email: string;
  tier: Tier;
}

export interface ApiKeyDoc {
  _id: string;
  userId: string;
  name: string;
  hash: string;
  status: "active" | "revoked";
  tier: Tier;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  apimSubscriptionId?: string;
  apimSubscriptionKey?: string; // encrypted
}

export interface ApiKeyMeta {
  id: string;
  name: string;
  email: string;
  status: "active" | "revoked";
  tier: Tier;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  apimSubscriptionId?: string;
}

export async function createApiKey(
  email: string,
  tier: Tier,
  name: string,
  expiresAt?: Date
): Promise<{ key: string; meta: ApiKeyMeta }> {
  const raw = `k_${randomBytes(32).toString("base64url")}`;
  const hash = await bcrypt.hash(raw, 10);
  const id = randomUUID();
  const now = new Date();

  const doc: ApiKeyDoc = {
    _id: id,
    userId: email,
    name,
    hash,
    status: "active",
    tier,
    createdAt: now,
    lastUsedAt: null,
    expiresAt: expiresAt || null,
  };

  const db = await getDb();
  await db.collection<ApiKeyDoc>("api_keys").insertOne(doc);

  let apimSubscriptionId: string | undefined;

  // Check if user already has an APIM subscription from an existing key
  const existingKey = await db
    .collection<ApiKeyDoc>("api_keys")
    .findOne({ userId: email, apimSubscriptionId: { $exists: true, $ne: "" }, _id: { $ne: id } } as any);

  const subscription = await getOrCreateSubscription(id, name, existingKey?.apimSubscriptionId);
  if (subscription) {
    apimSubscriptionId = subscription.subscriptionId;
  }

  if (subscription) {
    await db.collection<ApiKeyDoc>("api_keys").updateOne(
      { _id: id },
      {
        $set: {
          apimSubscriptionId,
          apimSubscriptionKey: encrypt(subscription.primaryKey),
        },
      }
    );
  }

  return {
    key: raw,
    meta: {
      id,
      name,
      email,
      status: "active",
      tier,
      createdAt: now,
      lastUsedAt: null,
      expiresAt: expiresAt || null,
      apimSubscriptionId,
    },
  };
}

export async function authenticateRequest(
  request: NextRequest
): Promise<RequestIdentity> {
  // Path 1: Request came from APIM (production)
  const apimSecret = request.headers.get("x-apim-secret");
  if (apimSecret) {
    if (apimSecret !== APIM_SHARED_SECRET) {
      throw new Error("APIM secret mismatch");
    }
    const email = request.headers.get("x-user-email");
    const tier = request.headers.get("x-user-tier") as Tier;
    const keyId = request.headers.get("x-key-id") || "";
    if (!email || !tier) {
      throw new Error("Missing identity headers from APIM");
    }
    return { keyId, email, tier };
  }

  // Path 2: Direct API key
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    throw new Error("No API key or APIM secret provided");
  }

  const db = await getDb();
  const keys = await db
    .collection<ApiKeyDoc>("api_keys")
    .find({ status: "active" })
    .toArray();

  for (const doc of keys) {
    const match = await bcrypt.compare(apiKey, doc.hash);
    if (match) {
      if (doc.expiresAt && doc.expiresAt < new Date()) {
        throw new Error("API key expired");
      }

      await db
        .collection<ApiKeyDoc>("api_keys")
        .updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } });

      return { keyId: doc._id, email: doc.userId, tier: doc.tier };
    }
  }

  throw new Error("API key not found or revoked");
}

export async function listKeys(): Promise<ApiKeyMeta[]> {
  const db = await getDb();
  const docs = await db
    .collection<ApiKeyDoc>("api_keys")
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((d) => ({
    id: d._id,
    name: d.name,
    email: d.userId,
    status: d.status,
    tier: d.tier,
    createdAt: d.createdAt,
    lastUsedAt: d.lastUsedAt,
    expiresAt: d.expiresAt,
    apimSubscriptionId: d.apimSubscriptionId,
  }));
}

export async function listKeysByEmail(email: string): Promise<ApiKeyMeta[]> {
  const db = await getDb();
  const docs = await db
    .collection<ApiKeyDoc>("api_keys")
    .find({ userId: email })
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((d) => ({
    id: d._id,
    name: d.name,
    email: d.userId,
    status: d.status,
    tier: d.tier,
    createdAt: d.createdAt,
    lastUsedAt: d.lastUsedAt,
    expiresAt: d.expiresAt,
    apimSubscriptionId: d.apimSubscriptionId,
  }));
}

export async function validateKey(
  apiKey: string
): Promise<{ active: true; keyId: string; userId: string; tier: Tier; apimSubscriptionId?: string; apimSubscriptionKey?: string } | { active: false }> {
  const db = await getDb();
  const keys = await db
    .collection<ApiKeyDoc>("api_keys")
    .find({ status: "active" })
    .toArray();

  for (const doc of keys) {
    const match = await bcrypt.compare(apiKey, doc.hash);
    if (match) {
      if (doc.expiresAt && doc.expiresAt < new Date()) {
        return { active: false };
      }

      await db
        .collection<ApiKeyDoc>("api_keys")
        .updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } });

      return {
        active: true,
        keyId: doc._id,
        userId: doc.userId,
        tier: doc.tier,
        apimSubscriptionId: doc.apimSubscriptionId,
        apimSubscriptionKey: doc.apimSubscriptionKey ? decrypt(doc.apimSubscriptionKey) : undefined,
      };
    }
  }

  return { active: false };
}

export async function updateKeyTier(
  id: string,
  tier: Tier
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<ApiKeyDoc>("api_keys")
    .updateOne({ _id: id }, { $set: { tier } });
  return result.modifiedCount > 0;
}

export async function revokeKey(
  id: string,
  email?: string
): Promise<boolean> {
  const db = await getDb();
  const filter: Record<string, string> = { _id: id };
  if (email) filter.userId = email;
  const result = await db
    .collection<ApiKeyDoc>("api_keys")
    .updateOne(filter, { $set: { status: "revoked" } });
  return result.modifiedCount > 0;
}

export async function deleteKey(
  id: string,
  email: string
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<ApiKeyDoc>("api_keys")
    .deleteOne({ _id: id, userId: email });
  return result.deletedCount > 0;
}
