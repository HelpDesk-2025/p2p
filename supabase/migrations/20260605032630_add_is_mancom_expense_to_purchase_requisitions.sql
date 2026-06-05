ALTER TABLE purchase_requisitions
  ADD COLUMN is_mancom_expense boolean NOT NULL DEFAULT false;