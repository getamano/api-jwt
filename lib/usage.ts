import { getDb } from "./db";

export interface UsageDoc {
  _id: string; // keyId
  tier: string;
  totalCalls: number;
  callsThisMinute: number;
  callsThisMonth: number;
  minuteResetAt: Date;
  monthResetAt: Date;
  lastCallAt: Date;
  history: { date: string; calls: number }[];
}

const MINUTE = 60 * 1000;
const MONTH = 30 * 24 * 60 * 60 * 1000;

export async function trackCall(keyId: string, tier: string): Promise<void> {
  const db = await getDb();
  const col = db.collection<UsageDoc>("usage");
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const record = await col.findOne({ _id: keyId });

  if (!record) {
    await col.insertOne({
      _id: keyId,
      tier,
      totalCalls: 1,
      callsThisMinute: 1,
      callsThisMonth: 1,
      minuteResetAt: new Date(now.getTime() + MINUTE),
      monthResetAt: new Date(now.getTime() + MONTH),
      lastCallAt: now,
      history: [{ date: today, calls: 1 }],
    });
    return;
  }

  const updates: Record<string, unknown> = {
    tier,
    lastCallAt: now,
  };

  let minuteCalls = record.callsThisMinute;
  let monthCalls = record.callsThisMonth;

  if (now > record.minuteResetAt) {
    minuteCalls = 0;
    updates.minuteResetAt = new Date(now.getTime() + MINUTE);
  }

  if (now > record.monthResetAt) {
    monthCalls = 0;
    updates.monthResetAt = new Date(now.getTime() + MONTH);
  }

  updates.callsThisMinute = minuteCalls + 1;
  updates.callsThisMonth = monthCalls + 1;

  // Update daily history
  const lastEntry = record.history[record.history.length - 1];
  if (lastEntry && lastEntry.date === today) {
    await col.updateOne(
      { _id: keyId, "history.date": today },
      {
        $set: updates,
        $inc: { totalCalls: 1, "history.$.calls": 1 },
      }
    );
  } else {
    await col.updateOne(
      { _id: keyId },
      {
        $set: updates,
        $inc: { totalCalls: 1 },
        $push: { history: { date: today, calls: 1 } },
      }
    );
  }
}

export async function getUsage(keyId: string): Promise<UsageDoc | null> {
  const db = await getDb();
  return db.collection<UsageDoc>("usage").findOne({ _id: keyId });
}

export function getLimits(tier: string) {
  if (tier === "starter") {
    return { rateLimit: 10, quota: 10000 };
  }
  return { rateLimit: 10000, quota: 1000000 };
}
