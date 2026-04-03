-- =====================================================================
-- GameVault · Fix: RLS en loans para permitir INSERT de admins
-- Ejecutar en Supabase → SQL Editor
-- =====================================================================

-- 1. Asegurarse de que RLS está habilitado en loans
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- 2. Borrar políticas antiguas por si acaso no se aplicaron bien
DROP POLICY IF EXISTS "loans_select_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_insert_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_update_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_delete_policy" ON public.loans;

-- 3. SELECT: admin ve todos, usuario ve los suyos
CREATE POLICY "loans_select_policy" ON public.loans
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. INSERT: admin puede crear préstamos para cualquier usuario
CREATE POLICY "loans_insert_policy" ON public.loans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. UPDATE: admin puede actualizar (marcar devoluciones etc.)
CREATE POLICY "loans_update_policy" ON public.loans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. DELETE: solo admin
CREATE POLICY "loans_delete_policy" ON public.loans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 7. Verificar que tu usuario es admin (cambia el email por el tuyo)
-- Si el resultado es vacío, necesitas ejecutar el paso 8
SELECT id, full_name, role FROM public.profiles WHERE role = 'admin';

-- 8. [SOLO SI NECESARIO] Hacer admin al usuario actual si no lo es
-- UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
