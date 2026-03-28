export interface JobEmailRow {
  id: number;
  from_addr: string;
  subject: string;
  snippet: string;
  status: "positive" | "negative" | "neutral";
  email_date: string;
  created_at: string;
  linked_job_id: string | null;
  gmail_message_id: string;
  gmail_thread_id: string;
  followup_subject: string;
  followup_body: string;
  followup_created_at: string;
  full_body: string;
}

export interface JobPostingRow {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  pipeline_status: string;
  found_at: string;
  job_score: number | null;
  job_score_reason: string;
  job_scored_at: string;
  detected_language: string;
  job_type: string;
  outcome: string;
}

export interface MemoryRow {
  id: number;
  content: string;
  category: string;
  is_archived: number;
  created_at: string;
}

export interface ProfileRow {
  key: string;
  value: string;
}

export interface ConversationRow {
  id: number;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  dialogue_id: number | null;
  created_at: string;
}

export interface DialogueRow {
  id: number;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface SpontaneousTargetRow {
  id: number;
  company: string;
  hr_name: string;
  hr_email: string;
  industry: string;
  notes: string;
  status: string;
  sent_at: string | null;
  email_subject: string;
  sent_letter: string;
}

export interface CvLibraryRow {
  id: number;
  job_type: string;
  language: string;
  file_path: string;
  file_name: string;
  updated_at: string;
}

export interface ReminderRow {
  id: number;
  label: string;
  due_at: string;
  sent: number;
  created_at: string;
}
