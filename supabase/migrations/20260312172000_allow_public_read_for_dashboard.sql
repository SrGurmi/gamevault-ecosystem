-- Allow public (anon) access for reading data in the local dashboard
-- This ensures the dashboard doesn't show '0 0 0' when not logged in
ALTER POLICY "Profiles are viewable by authenticated users" ON public.profiles TO authenticated, anon;
ALTER POLICY "Games are viewable by everyone" ON public.games TO authenticated, anon;
ALTER POLICY "Inventory is viewable by everyone" ON public.inventory_items TO authenticated, anon;

-- Add policies for anon if they don't exist (depending on if they were renamed)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read profiles') THEN
        CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read games') THEN
        CREATE POLICY "Public read games" ON public.games FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read inventory') THEN
        CREATE POLICY "Public read inventory" ON public.inventory_items FOR SELECT TO anon USING (true);
    END IF;
END $$;
