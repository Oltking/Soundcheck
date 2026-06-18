// Soundcheck BFF client. The frontend renders ONLY live Band data via the BFF
// (spec §15: no mock data in production). Server components fetch directly;
// client components use the same helpers.

import type {
  FindingEntry, LedgerEntry, ProvenanceNode, Run, TimelineItem,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:8000";

// Server components fetch at request time; Node's fetch can't take a relative URL
// like "/_/backend". So on the server we make it absolute (Vercel's deployment
// origin); in the browser the relative path is fine.
function resolveBase(): string {
  if (/^https?:\/\//i.test(BASE)) return BASE;        // already absolute
  if (typeof window !== "undefined") return BASE;     // browser → relative is fine
  const host = process.env.VERCEL_URL;                // server on Vercel
  if (host) return `https://${host}${BASE}`;
  return `http://localhost:3000${BASE}`;              // server, local fallback
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBase()}${path}`, { cache: "no-store", ...init });
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
  remediate: (id: string, file: string, finding: string) =>
    post<{ status: string }>(
      `/runs/${id}/remediate?file=${encodeURIComponent(file)}&finding=${encodeURIComponent(finding)}`),
  polish: (id: string) => post<{ status: string }>(`/runs/${id}/polish`),
  ask: (id: string, question: string) =>
    post<{ status: string; cold_start: boolean }>(
      `/runs/${id}/ask?question=${encodeURIComponent(question)}`),
};

export { BASE as BFF_BASE };
