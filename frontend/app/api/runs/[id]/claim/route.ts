import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimRoom } from "@/lib/owner";

// Claim ownership of a run (Band room) for the signed-in user. Called by the
// Connect flow the moment it discovers the new room it just started. First
// claimer wins (the insert is ON CONFLICT DO NOTHING).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing run id" }, { status: 400 });
  try {
    await claimRoom(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("claim failed", e);
    return NextResponse.json({ error: "Could not record ownership." }, { status: 500 });
  }
}
