import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api } from "@/lib/api";

// Snapshot the rooms that exist now (server-side, full view), then kick off a
// run. The browser polls /api/runs/discover with this baseline to find the new
// room and claim it - so the client never needs the unfiltered run list.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = new URL(req.url).searchParams.get("target") || undefined;
  let baseline: string[] = [];
  try {
    baseline = (await api.roomIds()).rooms.map((r) => r.room_id);
  } catch { /* BFF cold / empty - an empty baseline is fine */ }

  try {
    await api.startRun(target);
  } catch (e) {
    return NextResponse.json({ error: `Could not start a run: ${(e as Error).message}` }, { status: 502 });
  }
  return NextResponse.json({ baseline });
}
