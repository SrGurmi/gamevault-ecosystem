-- Añadir user_id a inventory_items para soportar inventarios por usuario
ALTER TABLE public.inventory_items 
ADD COLUMN user_id UUID REFERENCES public.profiles(id) DEFAULT auth.uid();

-- Actualizar la política de RLS para que los usuarios solo vean sus propios items
-- (Opcional: si quieres que el admin vea todo, puedes ajustar las políticas)
DROP POLICY IF EXISTS "Permitir lectura pública de juegos" ON inventory_items;
CREATE POLICY "Usuarios pueden ver su propio inventario" 
ON public.inventory_items 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden insertar en su propio inventario" 
ON public.inventory_items 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);
