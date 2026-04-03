-- 1. Tabla de Perfiles (Se sincroniza automáticamente con Supabase Auth)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Metadatos de Juegos (Caché de IGDB para optimizar peticiones) [3, 4]
CREATE TABLE public.games (
  id BIGINT PRIMARY KEY, -- Usamos el ID oficial de IGDB
  title TEXT NOT NULL,
  cover_url TEXT,
  summary TEXT,
  first_release_date TIMESTAMPTZ
);

-- 3. Inventario Físico (Lo que escaneas con la App móvil)
CREATE TABLE public.inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id BIGINT REFERENCES public.games(id),
  barcode TEXT UNIQUE NOT NULL, -- Soporta EAN-13 y UPC-A [5]
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'loaned', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Registro de Préstamos
CREATE TABLE public.loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES public.inventory_items(id),
  user_id UUID REFERENCES public.profiles(id),
  loan_date TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ NOT NULL,
  return_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'returned', 'overdue'))
);

-- Habilitar Row Level Security (RLS) en todas las tablas [6, 7]
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Función Trigger para crear el perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();