// Shapes returned by the Soundcheck BFF (backend/app/main.py).

export interface Run {
  room_id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  finding_count: number;
  control_count: number;
  orgcontext_count: number;
  patch_count: number;
  approval_count: number;
  task_count: number;
  message_count: number;
}

export type LedgerKind =
  | "OrgContext" | "Finding" | "ControlMapping"
  | "PatchProposal" | "ReviewResult" | "Approval" | "Policy";

export interface LedgerEntry {
  id: string;
  room_id: string;
  kind: LedgerKind;
  content: string;
  thought: string;
  tags: string[];
  refs: string[];
  status: "active" | "superseded" | "archived";
  sender: string | null;
  created_at: string | null;
  via: string;
}

export interface FindingEntry extends LedgerEntry {
  severity: string; // low | medium | high | critical | none | unknown
  controls: LedgerEntry[];
}

export type TimelineType =
  | "text" | "thought" | "task" | "tool_call" | "tool_result" | "error";

export interface TimelineItem {
  id: string;
  room_id: string;
  mtype: TimelineType;
  sender: string | null;
  sender_type: string | null;
  content: string | null;
  mentions: string[]; // resolved @names this message addresses (handoffs)
  created_at: string | null;
}

export interface ProvenanceNode {
  id: string;
  kind: LedgerKind;
  content: string;
  thought: string;
  status: string;
  references: ProvenanceNode[];
}
