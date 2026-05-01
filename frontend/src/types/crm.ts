export type ActivityKind = 'call' | 'visit' | 'email' | 'memo';

export interface PartnerActivity {
  activity_id: string;
  partner_id: string;
  author_user_id: string | null;
  kind: ActivityKind;
  body: string;
  follow_up_required: boolean;
  follow_up_due: string | null; // YYYY-MM-DD
  follow_up_done: boolean;
  follow_up_done_at: string | null;
  follow_up_done_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenFollowup extends PartnerActivity {
  partner: { partner_id: string; partner_name: string } | null;
}

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  call: '통화',
  visit: '방문',
  email: '메일',
  memo: '메모',
};

export const ACTIVITY_KIND_OPTIONS: { value: ActivityKind; label: string }[] = [
  { value: 'call', label: '통화' },
  { value: 'visit', label: '방문' },
  { value: 'email', label: '메일' },
  { value: 'memo', label: '메모' },
];
