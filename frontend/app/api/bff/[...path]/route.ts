import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ownedRoomIds, isOwner } from "@/lib/owner";

// Authenticated proxy for all BROWSER → BFF traffic. Client components call
// /api/bff/* (cookies included); this checks the session, enforces per-user
// ownership on room-scoped paths, and forwards to the BFF with the shared key.
// Server components talk to the BFF directly (they're already trusted and the
// run pages are gated by the run layout), so they don't pass through here.

const BFF = process.env.BFF_INTERNAL_URL || "http://localhost:8000";
const KEY = process.env.INTERNAL_API_KEY || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function forward(req: Request, path: string[]): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // room-scoped paths (runs/<uuid>/...) require ownership of that room
  if (path[0] === "runs" && path[1] && UUID.test(path[1])) {
    if (!(await isOwner(path[1], userId))) {
      return NextResponse.json({ error: "Not your run." }, { status: 403 });
    }
  }

  const search = new URL(req.url).search;
  const init: RequestInit = { method: req.method, cache: "no-store", headers: { "X-Internal-Key": KEY } };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) init.body = body;
    const ct = req.headers.get("content-type");
    if (ct) (init.headers as Record<string, string>)["content-type"] = ct;
  }

  const res = await fetch(`${BFF}/${path.join("/")}${search}`, init);
  const text = await res.text();

  // the run LIST is filtered to this user's owned rooms
  if (path.length === 1 && path[0] === "runs" && res.ok) {
    try {
      const data = JSON.parse(text);
      const owned = await ownedRoomIds(userId);
      data.runs = (data.runs || []).filter((r: { room_id: string }) => owned.has(r.room_id));
      return NextResponse.json(data, { status: res.status });
    } catch { /* fall through to passthrough */ }
  }

  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path || []);
}
export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path || []);
}
