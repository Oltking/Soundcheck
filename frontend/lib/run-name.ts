// A run is one Band room - its id is a long uuid. To make runs memorable and
// nameable (not just an opaque id), we derive a stable, concert-hall-themed
// codename deterministically from the room_id. Same id → same name, everywhere.

import type { Run } from "./types";
import type { SevKind } from "@/components/glyphs";

const ADJ = [
  "Velvet", "Amber", "Midnight", "Crimson", "Golden", "Silver", "Azure",
  "Ember", "Cobalt", "Ivory", "Scarlet", "Hollow", "Lucid", "Northern",
  "Quiet", "Radiant", "Slate", "Verdant", "Wandering", "Electric",
];

const NOUN = [
  "Coda", "Cello", "Overture", "Cadence", "Reverb", "Tempo", "Encore",
  "Sonata", "Refrain", "Crescendo", "Fugue", "Chorus", "Prelude", "Anthem",
  "Rhapsody", "Octave", "Nocturne", "Harmony", "Verse", "Echo",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable two-word codename for a run, e.g. "Velvet Coda". */
export function runName(roomId: string): string {
  const h = hash(roomId);
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
}

/** The short, human-quotable id shown beside the name. */
export function runShortId(roomId: string): string {
  return roomId.slice(0, 8);
}

export interface RunStatus {
  label: string;
  kind: SevKind; // drives the status-pill colour/shape
}

/** Where a run sits in the lifecycle, derived from its ledger counts.
 *  approved → remediation signed off · in review → patch awaiting the Conductor
 *  · audited → findings raised, no fix yet · setup → room opened, nothing yet. */
export function runStatus(run: Run): RunStatus {
  if (run.approval_count > 0) return { label: "approved", kind: "approved" };
  if (run.patch_count > 0) return { label: "in review", kind: "attention" };
  if (run.finding_count > 0) return { label: "audited", kind: "critical" };
  return { label: "setup", kind: "info" };
}
