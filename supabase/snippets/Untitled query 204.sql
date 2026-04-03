-- 1. Asegurar que RLS esté activo en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas previas para evitar conflictos
DO $$ 
DECLARE pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('loans', 'inventory_items', 'profiles', 'games')) 
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename); END LOOP;
END $$;

-- 3. FUNCIÓN MAESTRA (SECURITY DEFINER): Permite chequear roles sin bucles de RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  -- Esta consulta se salta el RLS para que no haya bloqueos circulares
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. POLÍTICAS DE PERFILES (Profiles)
CREATE POLICY "profiles_read_policy" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 5. POLÍTICAS DE JUEGOS (Games - catálogo base)
CREATE POLICY "games_read_policy" ON public.games FOR SELECT TO authenticated USING (true);

-- 6. POLÍTICAS DE INVENTARIO (Inventory Items)
CREATE POLICY "inventory_read_policy" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_insert_policy" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Los admins pueden editar cualquier item (importante para que el trigger cambie el estado a 'loaned')
CREATE POLICY "inventory_admin_manage" ON public.inventory_items FOR ALL TO authenticated USING (is_admin());

-- 7. POLÍTICAS DE PRÉSTAMOS (Loans)
-- Los usuarios ven sus préstamos
CREATE POLICY "loans_read_own" ON public.loans FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Los admins gestionan todos los préstamos
CREATE POLICY "loans_admin_manage" ON public.loans FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 8. RE-ACTIVAR EL TRIGGER DE ESTADOS (SECURITY DEFINER)
-- Esto garantiza que cuando creas un préstamo, el estado del juego cambie a 'loaned' automáticamente
CREATE OR REPLACE FUNCTION public.handle_loan_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.inventory_items SET status = 'loaned' WHERE id = NEW.inventory_item_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.return_date IS NOT NULL AND OLD.return_date IS NULL THEN
    UPDATE public.inventory_items SET status = 'available' WHERE id = NEW.inventory_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_loan_change ON public.loans;
CREATE TRIGGER on_loan_change AFTER INSERT OR UPDATE ON public.loans FOR EACH ROW EXECUTE PROCEDURE public.handle_loan_status_change();
