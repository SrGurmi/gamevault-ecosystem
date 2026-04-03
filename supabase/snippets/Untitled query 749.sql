-- Permitir que cualquiera lea los juegos
CREATE POLICY "Permitir lectura pública de juegos" ON games FOR SELECT USING (true);

-- Permitir que usuarios autenticados inserten juegos 
-- (O usa USING (true) si quieres permitirlo a todo el mundo por ahora)
CREATE POLICY "Permitir inserción de juegos" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir actualización de juegos" ON games FOR UPDATE USING (true);

-- Haz lo mismo para la tabla inventory_items si falla
CREATE POLICY "Permitir inserción en inventario" ON inventory_items FOR INSERT WITH CHECK (true);
