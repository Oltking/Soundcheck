// Soundcheck BFF client. The frontend renders ONLY live Band data (spec §15: no
// mock data in production).
//
// Two transports, same helpers:
//   • Browser  → the authenticated Next.js proxy at /api/bff/* (cookies sent;
//     the proxy enforces per-user ownership before reaching the BFF).
//   • Server   → the BFF directly with the shared internal key (server is
//     trusted; run pages are gated by the run layout).

import type {
  FindingEntry, LedgerEntry, ProvenanceNode, Run, TimelineItem,
} from "./types";

const PROXY = "/api/bff";                                   // browser-facing
const SERVER_BFF = process.env.BFF_INTERNAL_URL || "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || "";

const onServer = () => typeof window === "undefined";

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const url = onServer() ? `${SERVER_BFF}${path}` : `${PROXY}${path}`;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (onServer() && INTERNAL_KEY) headers["X-Internal-Key"] = INTERNAL_KEY;
  const res = await fetch(url, { cache: "no-store", ...init, headers });
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
  // Start a run + claim it (server-side; the discover step records ownership).
  startAndWatch: (target?: string) =>
    fetch(`/api/runs/start${target ? `?target=${encodeURIComponent(target)}` : ""}`, { method: "POST" })
      .then((r) => r.json() as Promise<{ baseline: string[] }>),
  discoverRun: (baseline: string[]) =>
    fetch(`/api/runs/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseline }),
    }).then((r) => r.json() as Promise<{ roomId: string | null }>),
};

// Browser-facing base for direct links (e.g. the audit-package download) — goes
// through the authenticated proxy so ownership is enforced.
export const BFF_BASE = PROXY;
