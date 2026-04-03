-- 1. Dar permisos de UPDATE a los admins en la tabla de inventario
-- (Para que el trigger de los préstamos pueda cambiar el estado del juego)
DROP POLICY IF EXISTS "inventory_items_admin_update" ON public.inventory_items;
CREATE POLICY "inventory_items_admin_update" ON public.inventory_items
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 2. Asegurar que los admins pueden ver todo el inventario
DROP POLICY IF EXISTS "inventory_items_admin_select" ON public.inventory_items;
CREATE POLICY "inventory_items_admin_select" ON public.inventory_items
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR auth.uid() = user_id
  );

-- 3. Blindar la tabla de Loans (Préstamos)
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loans_admin_all" ON public.loans;
CREATE POLICY "loans_admin_all" ON public.loans
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Permiso para que los usuarios vean sus propios préstamos
DROP POLICY IF EXISTS "loans_user_select" ON public.loans;
CREATE POLICY "loans_user_select" ON public.loans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
