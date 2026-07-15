import { Counter, Registry, collectDefaultMetrics } from "prom-client";

const globalMetrics = globalThis as unknown as { registry?: Registry };
export const registry = globalMetrics.registry ?? new Registry();
if (!globalMetrics.registry) {
  collectDefaultMetrics({ register: registry, prefix: "nine_ms_" });
  globalMetrics.registry = registry;
}

function counter(name: string, help: string) {
  const existing = registry.getSingleMetric(name);
  return (existing as Counter | undefined) ?? new Counter({ name, help, registers: [registry] });
}

export const transfersCreated = counter("nine_ms_transfers_created_total", "Transfers created");
export const downloadsStarted = counter("nine_ms_downloads_started_total", "Downloads started");
export const transfersQuarantined = counter("nine_ms_transfers_quarantined_total", "Transfers quarantined");
export const csamMatches = counter("nine_ms_csam_matches_total", "Transfers quarantined by CSAM safety scanning");
