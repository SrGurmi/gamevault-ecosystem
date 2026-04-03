-- 1. Desactivar RLS por completo para recuperar visibilidad inmediata
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas conflictivas para que no molesten en el futuro
DROP POLICY IF EXISTS "allow_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "allow_read_all_inventory" ON public.inventory_items;
DROP POLICY IF EXISTS "allow_read_all_loans" ON public.loans;
DROP POLICY IF EXISTS "allow_read_all_games" ON public.games;
DROP POLICY IF EXISTS "loans_admin_policy" ON public.loans;
DROP POLICY IF EXISTS "loans_admin_all" ON public.loans;
DROP POLICY IF EXISTS "inventory_admin_all" ON public.inventory_items;

