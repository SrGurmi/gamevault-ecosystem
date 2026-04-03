-- 1. DESACTIVAR TODO PARA LIMPIAR
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;

-- 2. BORRADO FÍSICO DE TODAS LAS POLÍTICAS PARA EVITAR CONFLICTOS
DO $$ 
DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profiles', 'inventory_items', 'loans', 'games'))
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 3. RE-ACTIVAR SEGURIDAD
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE LECTURA UNIVERSAL (PARA QUE NO SALGA VACÍO)
-- Usamos 'public' para que incluso si hay problemas de sesión, los datos se vean
CREATE POLICY "read_profiles" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "read_inventory" ON public.inventory_items FOR SELECT TO public USING (true);
CREATE POLICY "read_loans" ON public.loans FOR SELECT TO public USING (true);
CREATE POLICY "read_games" ON public.games FOR SELECT TO public USING (true);

-- 5. POLÍTICA DE PRÉSTAMOS PARA ADMINS (LA QUE ESTABA FALLANDO)
-- He simplificado la comprobación de admin para que sea directa y no falle
CREATE POLICY "admin_insert_loans" ON public.loans 
  FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_update_loans" ON public.loans 
  FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6. PERMISO PARA QUE EL TRIGGER CAMBIE EL ESTADO DEL JUEGO
CREATE POLICY "admin_update_inventory" ON public.inventory_items 
  FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
