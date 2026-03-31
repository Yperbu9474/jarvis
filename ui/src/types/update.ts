export type UpdateInfo = {
  current_version: string;
  latest_version: string | null;
  latest_name: string | null;
  latest_url: string | null;
  latest_published_at: string | null;
  has_update: boolean;
  popup_visible: boolean;
  dismissed_version: string | null;
  last_checked_at: number | null;
  check_error: string | null;
  update_status: string;
  update_message: string | null;
  update_started_at: number | null;
  update_completed_at: number | null;
};
