import { UserProfile } from '../../lib/supabase';

/**
 * Resolves which company_ids a query should be scoped to. Some users (mostly admins)
 * have multi-company access via `allowed_companies`; everyone else is scoped to their
 * single `company_id`. Approval RPCs (get_my_pending_approval_ids, etc.) already handle
 * this server-side — this helper is for the dashboard's own direct table queries so they
 * stay consistent with what those RPCs already surface.
 */
export function resolveCompanyIds(profile: UserProfile | null): string[] {
  if (!profile?.company_id) return [];
  if (profile.enable_multi_company_requests && profile.allowed_companies?.length) {
    return profile.allowed_companies;
  }
  return [profile.company_id];
}
