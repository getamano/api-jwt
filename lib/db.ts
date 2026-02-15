import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/api";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let seeded = false;

export async function getDb(): Promise<Db> {
  if (cachedDb) {
    if (!seeded) {
      seeded = true;
      // Dynamic import to avoid circular dependency
      const { seedAdmin } = await import("./users");
      await seedAdmin();
    }
    return cachedDb;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  cachedClient = client;
  cachedDb = client.db();

  // Ensure indexes
  await cachedDb
    .collection("api_keys")
    .createIndex({ userId: 1, status: 1 });

  await cachedDb
    .collection("users")
    .createIndex({ email: 1 }, { unique: true });

  await cachedDb
    .collection("api_usage")
    .createIndex({ keyId: 1, userId: 1, timestamp: -1 });

  seeded = true;
  const { seedAdmin } = await import("./users");
  await seedAdmin();

  return cachedDb;
}
