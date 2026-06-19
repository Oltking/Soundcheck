import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api } from "@/lib/api";
import { claimRoom } from "@/lib/owner";

// Find the run the user just started — the newest room not in the baseline —
// and claim it for them. Returns { roomId } once it appears, else { roomId: null }.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let baseline: string[] = [];
  try {
    baseline = (await req.json())?.baseline ?? [];
  } catch { /* no body — treat as empty baseline */ }
  const seen = new Set(baseline);

  try {
    await api.refreshAll();
    const { runs } = await api.listRuns();
    const fresh = runs
      .filter((r) => !seen.has(r.room_id))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
    if (fresh) {
      await claimRoom(fresh.room_id, session.user.id);
      return NextResponse.json({ roomId: fresh.room_id });
    }
  } catch { /* keep the caller polling */ }
  return NextResponse.json({ roomId: null });
}
