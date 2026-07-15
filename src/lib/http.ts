import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
