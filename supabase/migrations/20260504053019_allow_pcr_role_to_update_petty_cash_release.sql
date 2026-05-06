/*
  # Allow PCR roles to update petty cash for release

  1. Problem
    - Custom roles with the "Petty Cash Release" permission could not update
      `cash_released`, `cash_released_at`, `cash_released_by` because no UPDATE
      policy matched them.

  2. Change
    - Add UPDATE policy scoped the same way as the SELECT policy: permission
      check plus role -> company mapping (or user's own company_id fallback).

  3. Security
    - Still requires authentication.
    - Scoped strictly by role -> company mapping.
*/

DROP POLICY IF EXISTS "PCR role can update scoped petty cash requests" ON public.petty_cash_requests;
CREATE POLICY "PCR role can update scoped petty cash requests"
  ON public.petty_cash_requests
  FOR UPDATE
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
  )
  WITH CHECK (
    public.user_has_permission('Petty Cash Release')
  );
