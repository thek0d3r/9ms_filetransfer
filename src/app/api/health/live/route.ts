import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "9ms-web" });
}
