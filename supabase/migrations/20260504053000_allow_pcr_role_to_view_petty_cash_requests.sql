/*
  # Allow Petty Cash Release roles to view petty cash requests

  1. Problem
    - RLS on `petty_cash_requests` only allowed SELECT for admin / approver /
      procurement / accounting / requester. Custom roles with the
      "Petty Cash Release" permission were blocked and saw an empty list.

  2. Change
    - Add a SELECT policy that admits any authenticated user whose role has the
      "Petty Cash Release" permission, limited to companies configured in
      `role_petty_cash_release_companies` for that role. If no companies are
      configured for the role, the user falls back to their own company scope.
    - Admin / full-access roles continue to see everything via existing
      policies and `user_has_permission` short-circuits.

  3. Security
    - Still requires authentication.
    - Strictly scoped by role -> company mapping; defaults to user's own
      company_id when no explicit mapping exists.
*/

DROP POLICY IF EXISTS "PCR role can view scoped petty cash requests" ON public.petty_cash_requests;
CREATE POLICY "PCR role can view scoped petty cash requests"
  ON public.petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_permission('Petty Cash Release')
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_profiles up
        JOIN public.roles r ON lower(r.name) = lower(up.role)
        JOIN public.role_petty_cash_release_companies rc ON rc.role_id = r.id
        WHERE up.id = auth.uid()
          AND rc.company_id = petty_cash_requests.company_id
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.user_profiles up
          JOIN public.roles r ON lower(r.name) = lower(up.role)
          JOIN public.role_petty_cash_release_companies rc ON rc.role_id = r.id
          WHERE up.id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_profiles up
          WHERE up.id = auth.uid()
            AND up.company_id = petty_cash_requests.company_id
        )
      )
    )
  );
