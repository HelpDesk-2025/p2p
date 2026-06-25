DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'min_reimbursement') THEN
    ALTER TABLE companies ADD COLUMN min_reimbursement numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'min_liquidation') THEN
    ALTER TABLE companies ADD COLUMN min_liquidation numeric NOT NULL DEFAULT 0;
  END IF;
END $$;