export type TicketStatus =
  | "Processing"
  | "Pending Review"
  | "Open"
  | "In Progress"
  | "Resolved";

export interface Ticket {
  id: string;
  ticket_id: string;

  device_id: string;
  device_timestamp: string;
  created_at: string;

  audio_url: string;
  transcript: string;

  unit_code: string | null;

  equipment: string | null;
  location: string | null;
  issue_summary: string | null;

  confidence: number | null;
  missing_information: boolean | null;
  requires_human_review: boolean | null;

  status: TicketStatus;

  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}