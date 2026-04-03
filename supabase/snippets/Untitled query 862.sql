ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Borramos todo lo anterior
DROP POLICY IF EXISTS "loans_admin_all" ON public.loans;
DROP POLICY IF EXISTS "loans_insert_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_user_select" ON public.loans;

-- Política ULTRA-SIMPLE: Si el usuario en la tabla profiles es admin, puede hacer TODO
CREATE POLICY "admin_full_access" ON public.loans
  FOR ALL 
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Permitir que los estudiantes vean sus préstamos (pero no creen nuevos)
CREATE POLICY "student_view_own" ON public.loans
  FOR SELECT
  USING (auth.uid() = user_id);

