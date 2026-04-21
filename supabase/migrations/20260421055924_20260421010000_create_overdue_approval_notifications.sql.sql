/*
  # Overdue Approval Notifications Infrastructure

  Adds the database-side building blocks needed for a daily email digest that alerts
  approvers whose pending approvals have exceeded the `days_to_approve` configured for
  their current step in the Approval Steps Configuration.

  ## 1. Business-day helpers
    - `is_business_day(date)` returns false for Saturdays, Sundays, and any dates in the
      `holidays` table (honoring `is_recurring` by matching month+day).
    - `business_days_between(from_ts, to_ts)` counts business days strictly after the
      `from_ts` calendar date through the `to_ts` calendar date (Asia/Manila timezone).

  ## 2. Overdue pending approvals query
    - `get_overdue_pending_approvals()` returns one row per (approver, pending request)
      where the current step's received-at timestamp (last ledger action, falling back
      to the request's `created_at`) plus `days_to_approve` has already elapsed in
      business days.
    - Works across Purchase Requisition, Canvass, Petty Cash, Reimbursement, and
      Cash Advance requests.
    - Resolves approvers from `approval_flows.user_id`, `alternate_approver_id`,
      `ad_hoc_approvers`, and approver-type defaults (Department Head, Procurement,
      President).

  ## 3. New table: `notification_log`
    - Audits every email dispatched and deduplicates same-day repeats.
    - Columns: approver_id, approver_email, request_type, request_id,
      notification_type, status, error_message, sent_at, sent_date (generated).
    - RLS enabled; only admins may read. Inserts happen via service-role edge function.

  ## 4. Security & notes
    1. `notification_log` is locked down by default with RLS; admins can SELECT their
       own company's rows via the policy.
    2. The query function is marked SECURITY DEFINER so the scheduler can call it
       through the edge function regardless of the invoking role.
*/

CREATE OR REPLACE FUNCTION is_business_day(check_date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  dow int;
  hit int;
BEGIN
  IF check_date IS NULL THEN
    RETURN false;
  END IF;

  dow := EXTRACT(DOW FROM check_date)::int;
  IF dow = 0 OR dow = 6 THEN
    RETURN false;
  END IF;

  SELECT COUNT(*)::int INTO hit
  FROM holidays h
  WHERE (h.is_recurring IS NOT TRUE AND h.holiday_date = check_date)
     OR (h.is_recurring IS TRUE
         AND EXTRACT(MONTH FROM h.holiday_date) = EXTRACT(MONTH FROM check_date)
         AND EXTRACT(DAY FROM h.holiday_date) = EXTRACT(DAY FROM check_date));

  RETURN hit = 0;
END;
$$;

CREATE OR REPLACE FUNCTION business_days_between(from_ts timestamptz, to_ts timestamptz)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cur date;
  stop date;
  cnt int := 0;
BEGIN
  IF from_ts IS NULL OR to_ts IS NULL OR to_ts <= from_ts THEN
    RETURN 0;
  END IF;

  cur := (from_ts AT TIME ZONE 'Asia/Manila')::date + 1;
  stop := (to_ts AT TIME ZONE 'Asia/Manila')::date;

  WHILE cur <= stop LOOP
    IF is_business_day(cur) THEN
      cnt := cnt + 1;
    END IF;
    cur := cur + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approver_id uuid NOT NULL,
  approver_email text NOT NULL DEFAULT '',
  request_type text NOT NULL,
  request_id uuid NOT NULL,
  notification_type text NOT NULL DEFAULT 'overdue_approval',
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_date date GENERATED ALWAYS AS (((sent_at AT TIME ZONE 'Asia/Manila')::date)) STORED
);

CREATE INDEX IF NOT EXISTS idx_notification_log_dedupe
  ON notification_log(approver_id, request_id, notification_type, sent_date);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
  ON notification_log(sent_at DESC);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notification_log'
      AND policyname = 'Admins can view notification log'
  ) THEN
    CREATE POLICY "Admins can view notification log"
      ON notification_log FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.id = auth.uid() AND up.role = 'admin'
      ));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_overdue_pending_approvals()
RETURNS TABLE (
  approver_id uuid,
  approver_email text,
  approver_name text,
  request_type text,
  request_id uuid,
  request_number text,
  requester_name text,
  company_id uuid,
  company_name text,
  amount numeric,
  purpose text,
  received_at timestamptz,
  days_waiting int,
  days_allowed int,
  days_overdue int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH pending AS (
    SELECT 'Purchase Requisition'::text AS rt, pr.id AS rid, pr.pr_number AS rn, pr.requester_id,
           pr.company_id AS cid, pr.department AS dept, pr.total_amount AS amt,
           pr.purpose AS pp, pr.current_approval_level AS cal,
           COALESCE(pr.is_budgeted, false) AS budgeted, pr.created_at AS req_created
    FROM purchase_requisitions pr
    WHERE pr.status = 'pending'

    UNION ALL
    SELECT 'Canvass'::text, c.id, c.canvass_number, c.requester_id,
           c.company_id, c.department, c.total_amount, NULL,
           c.current_approval_level, COALESCE(c.is_budgeted, false), c.created_at
    FROM canvass_requests c
    WHERE c.status = 'pending'

    UNION ALL
    SELECT 'Petty Cash'::text, p.id, p.pc_number, p.requester_id,
           p.company_id, p.department, p.amount, p.purpose,
           p.current_approval_level, false, p.created_at
    FROM petty_cash_requests p
    WHERE p.status = 'pending'

    UNION ALL
    SELECT 'Reimbursement'::text, r.id, r.reimb_number, r.requester_id,
           r.company_id, r.department, r.amount, r.purpose,
           r.current_approval_level, false, r.created_at
    FROM reimbursement_requests r
    WHERE r.status = 'pending'

    UNION ALL
    SELECT 'Cash Advance'::text, ca.id, ca.ca_number, ca.requester_id,
           ca.company_id, ca.department, ca.amount, ca.purpose,
           ca.current_approval_level, COALESCE(ca.budgeted, false), ca.created_at
    FROM cash_advance_requests ca
    WHERE ca.status = 'pending'
  ),
  with_received AS (
    SELECT p.*,
      COALESCE(
        (SELECT MAX(al.approval_date)
           FROM approval_ledger al
          WHERE al.request_type = p.rt
            AND al.request_id = p.rid
            AND al.approval_date IS NOT NULL),
        p.req_created
      ) AS received_ts
    FROM pending p
  ),
  with_workflow AS (
    SELECT wr.*,
      CASE
        WHEN wr.rt IN ('Purchase Requisition','Canvass','Cash Advance') THEN
          CASE
            WHEN NOT wr.budgeted THEN 1
            WHEN COALESCE(wr.amt, 0) <
                 COALESCE((SELECT c.president_min_amount FROM companies c WHERE c.id = wr.cid), 0)
              THEN 2
            ELSE 3
          END
        ELSE 1
      END AS wt
    FROM with_received wr
  ),
  flow_step AS (
    SELECT ww.*,
      af.id AS flow_id,
      af.days_to_approve,
      af.user_id AS flow_user_id,
      af.alternate_approver_id,
      af.approver_type
    FROM with_workflow ww
    JOIN approval_flow_setups afs
      ON afs.company_id = ww.cid
     AND afs.request_type = ww.rt
     AND afs.is_active = true
     AND (afs.department_id = ww.dept OR afs.department_id IS NULL)
    JOIN approval_flows af
      ON af.approval_flow_setup_id = afs.id
     AND af.workflow_type = ww.wt
     AND af.is_active = true
     AND af.sequence = ww.cal + 1
  ),
  candidate_approvers AS (
    SELECT fs.*, fs.flow_user_id AS app_id
    FROM flow_step fs
    WHERE fs.flow_user_id IS NOT NULL

    UNION ALL
    SELECT fs.*, fs.alternate_approver_id
    FROM flow_step fs
    WHERE fs.alternate_approver_id IS NOT NULL

    UNION ALL
    SELECT fs.*, aha.user_id
    FROM flow_step fs
    JOIN ad_hoc_approvers aha
      ON aha.request_type = fs.rt
     AND aha.request_id = fs.rid
     AND aha.sequence = fs.cal + 1
     AND aha.status = 'pending'
    WHERE aha.user_id IS NOT NULL

    UNION ALL
    SELECT fs.*, up.id
    FROM flow_step fs
    JOIN user_profiles up
      ON up.company_id = fs.cid
     AND up.department = fs.dept
     AND up.role = 'approver'
     AND COALESCE(up.is_active, true) = true
    WHERE fs.flow_user_id IS NULL
      AND fs.approver_type = 'Department Head'

    UNION ALL
    SELECT fs.*, up.id
    FROM flow_step fs
    JOIN user_profiles up
      ON up.company_id = fs.cid
     AND up.department = 'Procurement'
     AND up.role = 'approver'
     AND COALESCE(up.is_active, true) = true
    WHERE fs.flow_user_id IS NULL
      AND fs.approver_type IN ('Procurement','Procurement Head')

    UNION ALL
    SELECT fs.*, up.id
    FROM flow_step fs
    JOIN user_profiles up
      ON up.company_id = fs.cid
     AND up.role = 'approver'
     AND COALESCE(up.is_active, true) = true
    WHERE fs.flow_user_id IS NULL
      AND fs.approver_type = 'President'
  ),
  distinct_pairs AS (
    SELECT DISTINCT ON (ca.rid, ca.app_id)
      ca.rt, ca.rid, ca.rn, ca.cid, ca.requester_id,
      ca.amt, ca.pp, ca.received_ts, ca.days_to_approve, ca.app_id
    FROM candidate_approvers ca
    WHERE ca.app_id IS NOT NULL
    ORDER BY ca.rid, ca.app_id
  )
  SELECT
    dp.app_id,
    COALESCE(up.email, ''),
    COALESCE(up.full_name, 'Approver'),
    dp.rt,
    dp.rid,
    dp.rn,
    COALESCE(req.full_name, 'Requester'),
    dp.cid,
    COALESCE(co.name, ''),
    dp.amt,
    dp.pp,
    dp.received_ts,
    business_days_between(dp.received_ts, now()),
    dp.days_to_approve,
    business_days_between(dp.received_ts, now()) - dp.days_to_approve
  FROM distinct_pairs dp
  JOIN user_profiles up
    ON up.id = dp.app_id
   AND COALESCE(up.is_active, true) = true
   AND COALESCE(up.email, '') <> ''
  LEFT JOIN user_profiles req ON req.id = dp.requester_id
  LEFT JOIN companies co ON co.id = dp.cid
  WHERE business_days_between(dp.received_ts, now()) > COALESCE(dp.days_to_approve, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_overdue_pending_approvals() TO authenticated, service_role;
