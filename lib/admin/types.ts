export const SUPERUSER_EMAIL = "bhoomika@plizzy.in";
export type AdminUser = {
  id: string; email: string | null; name: string | null; username: string | null;
  created_at: string; last_sign_in_at: string | null; verified: boolean; is_admin: boolean;
  games: number; solo: number; multiplayer: number; attempts: number; attempts_today: number;
  rooms: number; saved: number; last_game_at: string | null;
};
export type AdminGame = { id: string; title: string; creator_id: string; creator_email: string | null; created_at: string; mode: string | null; visibility: string; archived: boolean };
export type AdminSnapshot = {
  generated_at: string; days: number;
  totals: { users: number; verified: number; new_users: number; signed_in: number; creators: number; games: number; new_games: number; solo: number; multiplayer: number; archived: number; public_games: number; rooms: number; attempts: number; attempts_today: number; quota_reached: number };
  trend: { day: string; users: number; games: number; attempts: number }[];
  users: AdminUser[]; matched_users: number; page: number; page_size: number;
  recent_games: AdminGame[];
  selected: { user: AdminUser; games: AdminGame[] } | null;
};
