import { redirect } from "next/navigation";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function LegacyStage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  let target = "/";
  if (run) {
    target = `/run/${run}/stage`;
  } else {
    try {
      const { runs } = await api.listRuns();
      const r = runs.find((x) => x.finding_count > 0) || runs[0];
      if (r) target = `/run/${r.room_id}/stage`;
    } catch { /* */ }
  }
  redirect(target);
}
