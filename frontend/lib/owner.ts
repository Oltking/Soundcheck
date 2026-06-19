// Run ownership (tenancy). Each Band room is owned by the user who started it.
// Lives in the same Postgres as auth; the agents/BFF never see this table.
import { pool } from "@/lib/db";

export async function ownedRoomIds(userId: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    "SELECT room_id FROM run_owner WHERE owner_id = $1",
    [Number(userId)],
  );
  return new Set(rows.map((r) => r.room_id as string));
}

// First claimer wins; claiming an already-owned room is a no-op.
export async function claimRoom(roomId: string, userId: string): Promise<void> {
  await pool.query(
    "INSERT INTO run_owner (room_id, owner_id) VALUES ($1, $2) ON CONFLICT (room_id) DO NOTHING",
    [roomId, Number(userId)],
  );
}

export async function isOwner(roomId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM run_owner WHERE room_id = $1 AND owner_id = $2",
    [roomId, Number(userId)],
  );
  return rows.length > 0;
}
