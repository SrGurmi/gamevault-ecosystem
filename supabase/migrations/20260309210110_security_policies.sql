-- 1. Políticas para PROFILES
-- Permitir que cualquier usuario autenticado vea los nombres de otros (necesario para ver quién tiene un préstamo) [2, 3]
CREATE POLICY "Profiles are viewable by authenticated users" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- Solo el dueño del perfil puede actualizar sus propios datos
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);

-- 2. Políticas para GAMES (Catálogo de metadatos)
-- Todos los alumnos pueden leer el catálogo de juegos [4]
CREATE POLICY "Games are viewable by everyone" 
ON public.games FOR SELECT 
TO authenticated 
USING (true);

-- 3. Políticas para INVENTORY_ITEMS
-- Todos pueden ver qué juegos hay físicamente en el centro
CREATE POLICY "Inventory is viewable by everyone" 
ON public.inventory_items FOR SELECT 
TO authenticated 
USING (true);

-- 4. Políticas para LOANS (Préstamos)
-- Un alumno solo puede ver SUS PROPIOS préstamos [4, 5]
CREATE POLICY "Users can view their own loans" 
ON public.loans FOR SELECT 
TO authenticated 
USING ((select auth.uid()) = user_id);

-- Un alumno solo puede crear préstamos para sí mismo
CREATE POLICY "Users can create their own loan requests" 
ON public.loans FOR INSERT 
TO authenticated 
WITH CHECK ((select auth.uid()) = user_id);