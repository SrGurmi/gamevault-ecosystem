-- =====================================================================
-- GameVault · Migración: Índices de rendimiento + Loans funcionales
-- =====================================================================

-- 1. Índices para escalabilidad (100k usuarios)
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_id   ON public.inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_game_id   ON public.inventory_items(game_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status    ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_loans_user_id             ON public.loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status              ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_due_date            ON public.loans(due_date);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at       ON public.profiles(updated_at DESC);

-- 2. Asegurar que loans tenga inventory_item_id (renombrar item_id si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loans'
      AND column_name = 'item_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loans'
      AND column_name = 'inventory_item_id'
  ) THEN
    ALTER TABLE public.loans RENAME COLUMN item_id TO inventory_item_id;
  END IF;
END $$;

-- 3. Añadir columna notes a loans (para comentarios del préstamo)
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 4. Añadir updated_at a loans para auditoría
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. RLS para loans: los admins ven todo, usuarios solo los suyos
DROP POLICY IF EXISTS "loans_select_policy" ON public.loans;
CREATE POLICY "loans_select_policy" ON public.loans
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "loans_insert_policy" ON public.loans;
CREATE POLICY "loans_insert_policy" ON public.loans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "loans_update_policy" ON public.loans;
CREATE POLICY "loans_update_policy" ON public.loans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Actualizar status del inventory_item automáticamente al crear/devolver un préstamo
CREATE OR REPLACE FUNCTION public.handle_loan_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Al crear préstamo → marcar item como 'loaned'
    UPDATE public.inventory_items
    SET status = 'loaned'
    WHERE id = NEW.inventory_item_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.return_date IS NOT NULL AND OLD.return_date IS NULL THEN
    -- Al registrar devolución → marcar item como 'available'
    UPDATE public.inventory_items
    SET status = 'available'
    WHERE id = NEW.inventory_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_loan_change ON public.loans;
CREATE TRIGGER on_loan_change
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE PROCEDURE public.handle_loan_status_change();

-- 7. Función para registrar updated_at en profiles automáticamente
CREATE OR REPLACE FUNCTION public.handle_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_update ON public.profiles;
CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_profile_updated_at();