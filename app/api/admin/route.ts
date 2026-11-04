import { createClient } from "@supabase/supabase-js";
import { SUPERUSER_EMAIL } from "@/lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return fail("Sign in to Plizzy Admin.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("Admin reporting is temporarily unavailable.", 503);
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // A live Auth lookup checks the current email/account, not editable metadata.
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return fail("Your session expired. Sign in again.", 401);
    if (user.email?.toLowerCase() !== SUPERUSER_EMAIL || !user.email_confirmed_at) return fail("This account does not have admin access.", 403);
    const verified = await admin.auth.getClaims(token);
    const claims = verified.data?.claims;
    if (verified.error || !claims || claims.sub !== user.id || typeof claims.session_id !== "string" || !uuid.test(claims.session_id) || !Array.isArray(claims.amr) || !claims.amr.some(item => typeof item === "object" && item !== null && item.method === "otp")) return fail("Sign in with your email code to continue.", 401);

    const search = new URL(request.url).searchParams;
    const days = Number(search.get("days") ?? 30);
    const page = Number(search.get("page") ?? 1);
    const query = (search.get("q") ?? "").trim();
    const sort = search.get("sort") ?? "newest";
    const userId = search.get("user") || null;
    if (![7, 30, 90].includes(days) || !Number.isInteger(page) || page < 1 || page > 100000 || query.length > 100 || !["newest", "games", "signins"].includes(sort) || userId && !uuid.test(userId)) return fail("Invalid report filters.", 400);
    const { data, error: reportError } = await admin.rpc("admin_dashboard_snapshot", { p_actor_id: user.id, p_session_id: claims.session_id, p_days: days, p_page: page, p_query: query, p_sort: sort, p_user_id: userId });
    if (reportError) return fail(reportError.code === "42501" ? "This account does not have admin access." : "Could not load the report. Please try again.", reportError.code === "42501" ? 403 : 503);
    if (!data) return fail("Could not load the report. Please try again.", 503);
    return Response.json(data, { headers });
  } catch {
    // Do not put bearer tokens, personal data or provider diagnostics in logs.
    return fail("Admin reporting is temporarily unavailable.", 503);
  }
}
