-- 1. Borrar todas las políticas existentes para evitar conflictos
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('loans', 'inventory_items', 'profiles')) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. Función is_admin() blindada (Security Definer)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Habilitar RLS en las 3 tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS PARA PROFILES
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (is_admin());

-- 5. POLÍTICAS PARA INVENTORY_ITEMS
CREATE POLICY "inventory_select_all" ON public.inventory_items FOR SELECT TO authenticated USING (true);
-- Los dueños pueden insertar sus juegos
CREATE POLICY "inventory_insert_owner" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Los admins pueden hacer TODO en inventario (necesario para el trigger de préstamos)
CREATE POLICY "inventory_admin_all" ON public.inventory_items FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 6. POLÍTICAS PARA LOANS (Préstamos)
-- Admin puede hacer todo
CREATE POLICY "loans_admin_all" ON public.loans FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
-- Usuarios pueden ver sus propios préstamos
CREATE POLICY "loans_user_select" ON public.loans FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7. RE-INSTALAR TRIGGER DE PRÉSTAMOS CON PERMISOS DE SUPERUSUARIO
-- Esto es vital: el trigger debe poder cambiar el estado del juego sin importar el RLS
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
$$ LANGUAGE plpgsql SECURITY DEFINER; -- <--- ESTO ES LA CLAVE

DROP TRIGGER IF EXISTS on_loan_change ON public.loans;
CREATE TRIGGER on_loan_change
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE PROCEDURE public.handle_loan_status_change();
