-- Add policy to allow authenticated users to insert/upsert game metadata
-- This is needed because the mobile app caches game details from IGDB into our local 'games' table
CREATE POLICY "Allow authenticated users to insert game metadata" 
ON public.games FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Also allow updates in case metadata needs refining
CREATE POLICY "Allow authenticated users to update game metadata" 
ON public.games FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);
