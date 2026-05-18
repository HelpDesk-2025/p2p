/*
  # Add foreign key from purchase_orders.prepared_by to user_profiles

  1. Changes
    - Add foreign key constraint on `purchase_orders.prepared_by` referencing `user_profiles.id`
    - This enables PostgREST join queries like `user_profiles:prepared_by(full_name, email)`

  2. Notes
    - Uses IF NOT EXISTS pattern via DO block to be safe
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_orders_prepared_by_fkey'
    AND table_name = 'purchase_orders'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_prepared_by_fkey
      FOREIGN KEY (prepared_by) REFERENCES user_profiles(id);
  END IF;
END $$;
