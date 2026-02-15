import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin";
  createdAt: Date;
}

export async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const db = await getDb();
  const exists = await db.collection<UserDoc>("users").findOne({ email });
  if (exists) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await db.collection<UserDoc>("users").insertOne({
    _id: randomUUID(),
    email,
    passwordHash,
    role: "admin",
    createdAt: new Date(),
  });
}

export async function registerUser(
  email: string,
  password: string
): Promise<UserDoc> {
  const db = await getDb();
  const exists = await db.collection<UserDoc>("users").findOne({ email });
  if (exists) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const user: UserDoc = {
    _id: randomUUID(),
    email,
    passwordHash,
    role: "user",
    createdAt: new Date(),
  };

  await db.collection<UserDoc>("users").insertOne(user);
  return user;
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserDoc> {
  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ email });
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  return user;
}

export async function getUserById(id: string): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>("users").findOne({ _id: id });
}
