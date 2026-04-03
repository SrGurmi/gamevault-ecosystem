-- 1. Habilitar RLS (obligatorio)
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas antiguas
DROP POLICY IF EXISTS "loans_select_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_insert_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_update_policy" ON public.loans;

-- 3. Política de SELECT: Admin ve todos, usuario normal solo los suyos
CREATE POLICY "loans_select_policy" ON public.loans
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id 
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. Política de INSERT: SOLO admins pueden crear préstamos
-- Esta es la que te está fallando. Usaremos una forma más directa.
CREATE POLICY "loans_insert_policy" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5. Política de UPDATE: SOLO admins pueden actualizar (devoluciones)
CREATE POLICY "loans_update_policy" ON public.loans
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
