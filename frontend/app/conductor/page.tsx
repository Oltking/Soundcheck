import { redirect } from "next/navigation";
import { api } from "@/lib/api";

// Legacy route - now run-scoped. Compute the target, THEN redirect (redirect()
// throws NEXT_REDIRECT, so it must not be inside the try/catch).
export const dynamic = "force-dynamic";

export default async function Legacy() {
  let target = "/app";
  try {
    const { runs } = await api.listRuns();
    const r = runs.find((x) => x.finding_count > 0) || runs[0];
    if (r) target = `/run/${r.room_id}/conductor`;
  } catch { /* BFF down -> home */ }
  redirect(target);
}
