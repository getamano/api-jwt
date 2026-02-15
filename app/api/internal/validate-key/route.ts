import { NextRequest, NextResponse } from "next/server";
import { validateKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ active: false });
    }

    const result = await validateKey(apiKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ active: false });
  }
}
