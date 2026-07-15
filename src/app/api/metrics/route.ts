import { registry } from "@/lib/metrics";

export async function GET(request: Request) {
  if (process.env.METRICS_TOKEN && request.headers.get("authorization") !== `Bearer ${process.env.METRICS_TOKEN}`) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(await registry.metrics(), { headers: { "Content-Type": registry.contentType } });
}
