// Soundcheck BFF client. The frontend renders ONLY live Band data via the BFF
// (spec §15: no mock data in production). Server components fetch directly;
// client components use the same helpers.

import type {
  FindingEntry, LedgerEntry, ProvenanceNode, Run, TimelineItem,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:8000";

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`BFF ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string): Promise<T> {
  return get<T>(path, { method: "POST" });
}

export const api = {
  listRuns: () => get<{ runs: Run[] }>("/runs"),
  runDetail: (id: string) =>
    get<{ run: Run; ledger_by_kind: Record<string, LedgerEntry[]> }>(`/runs/${id}`),
  findings: (id: string) => get<{ findings: FindingEntry[] }>(`/runs/${id}/findings`),
  timeline: (id: string) => get<{ timeline: TimelineItem[] }>(`/runs/${id}/timeline`),
  chain: (id: string, entryId: string) =>
    get<{ chain: ProvenanceNode }>(`/runs/${id}/chain/${entryId}`),
  auditPackage: (id: string) => get<Record<string, unknown>>(`/runs/${id}/audit-package`),
  refreshAll: () => post<{ projected: number }>("/runs/refresh"),
  refreshOne: (id: string) => post<unknown>(`/runs/${id}/refresh`),
  startRun: (target?: string) =>
    post<{ status: string }>(`/runs/start${target ? `?target=${encodeURIComponent(target)}` : ""}`),
};

export { BASE as BFF_BASE };
