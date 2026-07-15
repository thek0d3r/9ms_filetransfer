import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    await Promise.all([pool.query("select 1"), redis.ping()]);
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
