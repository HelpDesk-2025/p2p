/*
  # Schedule Daily Overdue Approval Notifications

  Attempts to enable `pg_cron` + `pg_net` and register a daily cron job that invokes
  the `notify-overdue-approvals` edge function every weekday morning. The edge
  function itself additionally skips weekends and holidays, so double invocations
  on non-working days no-op safely.

  ## Notes
    1. Extensions are created in the `extensions` schema used by Supabase.
    2. The cron job is scheduled Mon-Fri at 01:00 server time (UTC).
    3. If extensions are unavailable in this environment, the DO block catches the
       error and logs a NOTICE so the migration still succeeds. Admins can then
       schedule the job manually from the Supabase Dashboard -> Database -> Cron.
*/

DO $$
DECLARE
  v_project_url text := current_setting('app.settings.supabase_url', true);
  v_anon_key    text := current_setting('app.settings.service_role_key', true);
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %', SQLERRM;
    RETURN;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net not available: %', SQLERRM;
    RETURN;
  END;

  BEGIN
    PERFORM cron.unschedule('notify-overdue-approvals-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'notify-overdue-approvals-daily',
      '0 1 * * 1-5',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.settings.supabase_url', true) ||
                 '/functions/v1/notify-overdue-approvals',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
    RAISE NOTICE 'Scheduled notify-overdue-approvals-daily cron job.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Unable to schedule cron job: %', SQLERRM;
  END;
END $$;
