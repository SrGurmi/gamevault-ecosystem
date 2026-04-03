-- Adjust unique constraint to allow multiple users to have the same game/barcode
-- We drop the old unique constraint on 'barcode' and add a new one on (barcode, user_id)
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_barcode_key;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_barcode_user_id_key UNIQUE (barcode, user_id);

-- Update RLS for Admin visibility
-- Drop existing select policy
DROP POLICY IF EXISTS "Usuarios pueden ver su propio inventario" ON public.inventory_items;

-- New select policy: Users see their own items, but Admins see EVERYTHING
CREATE POLICY "Inventory items viewable by owner or admin" 
ON public.inventory_items 
FOR SELECT 
TO authenticated 
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ))
);
