-- Permitir que los usuarios autenticados añadan juegos al inventario
CREATE POLICY "Authenticated users can register items" 
ON public.inventory_items 
FOR INSERT 
TO authenticated 
WITH CHECK (true); -- Permitimos la inserción si el JWT es válido

-- Opcional: Si quieres que solo el administrador pueda añadir, usa esta:
-- WITH CHECK ((select role from profiles where id = auth.uid()) = 'admin');