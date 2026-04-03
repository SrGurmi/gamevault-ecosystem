# 🗄️ Modelo de Base de Datos

Esquema relacional de GameVault sobre PostgreSQL (Supabase). Todas las tablas usan **Row Level Security** y las migraciones están en `supabase/migrations/`.

---

## Diagrama general

```
┌──────────────┐       ┌───────────────────┐       ┌──────────────┐
│   profiles   │       │  inventory_items   │       │    games     │
│──────────────│       │───────────────────│       │──────────────│
│ id (PK, FK)  │◄──────│ user_id (FK)       │       │ id (PK)      │
│ full_name    │       │ game_id (FK)       │──────►│ title        │
│ avatar_url   │       │ barcode (UNIQUE)   │       │ cover_url    │
│ role         │       │ status             │       │ summary      │
│ updated_at   │       │ created_at         │       │ first_release│
└──────┬───────┘       └────────┬──────────┘       └──────────────┘
       │                        │
       │     ┌──────────────────┘
       │     │
       ▼     ▼
┌──────────────────┐
│      loans       │
│──────────────────│
│ id (PK)          │
│ item_id (FK)     │───► inventory_items
│ user_id (FK)     │───► profiles (prestatario)
│ loan_date        │
│ due_date         │
│ return_date      │
│ status           │
│ notes            │
└──────────────────┘
```

---

## Tablas

### `profiles`

Se crea automáticamente mediante un trigger cuando un usuario se registra en Supabase Auth. Los datos se sincronizan desde `auth.users.raw_user_meta_data`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Referencia directa a `auth.users.id`, CASCADE on delete |
| `full_name` | TEXT | Nombre completo del usuario |
| `avatar_url` | TEXT | URL de la foto de perfil |
| `role` | TEXT | `'admin'` o `'student'` (default: `'student'`) |
| `updated_at` | TIMESTAMPTZ | Última modificación |

### `games`

Caché de los datos obtenidos desde IGDB. El `id` corresponde al ID oficial de IGDB para evitar duplicados en las consultas.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | BIGINT (PK) | ID de IGDB |
| `title` | TEXT | Nombre del juego |
| `cover_url` | TEXT | URL de la carátula (formato `t_cover_big`) |
| `summary` | TEXT | Resumen / descripción |
| `first_release_date` | TIMESTAMPTZ | Fecha de lanzamiento original |

### `inventory_items`

Cada fila representa un juego físico escaneado. El código de barras es único a nivel global.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `game_id` | BIGINT (FK) | Referencia a `games.id` |
| `user_id` | UUID (FK) | Propietario del juego |
| `barcode` | TEXT (UNIQUE) | Código EAN-13 o UPC-A |
| `status` | TEXT | `'available'`, `'loaned'` o `'maintenance'` |
| `created_at` | TIMESTAMPTZ | Fecha de registro |

### `loans`

Historial de préstamos. Un préstamo activo tiene `return_date = NULL`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `item_id` | UUID (FK) | Juego prestado |
| `user_id` | UUID (FK) | Usuario que recibe el préstamo |
| `loan_date` | TIMESTAMPTZ | Fecha del préstamo (default: NOW) |
| `due_date` | TIMESTAMPTZ | Fecha límite de devolución |
| `return_date` | TIMESTAMPTZ | `NULL` si aún no se ha devuelto |
| `status` | TEXT | `'active'`, `'returned'` o `'overdue'` |
| `notes` | TEXT | Notas opcionales (estado del juego, condiciones…) |

---

## Triggers

### `on_auth_user_created`

Se dispara `AFTER INSERT` en `auth.users`. Crea automáticamente una fila en `profiles` con los datos del registro (`full_name`, `avatar_url` desde `raw_user_meta_data`).

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Políticas RLS (resumen)

| Tabla | Lectura | Escritura |
|-------|---------|-----------|
| `profiles` | Todos los usuarios autenticados | Solo el propio usuario (o admin) |
| `games` | Pública | Usuarios autenticados pueden insertar |
| `inventory_items` | Pública (dashboard) | Solo el propietario puede insertar/modificar |
| `loans` | Usuarios autenticados | Autenticados crean; admins pueden devolver |

---

## Orden de migraciones

Las migraciones se ejecutan secuencialmente por timestamp:

1. `20260309141055_initial_schema.sql` — Esquema base (profiles, games, inventory_items, loans)
2. `20260309210110_security_policies.sql` — Políticas RLS iniciales
3. `20260310083036_allow_inventory_inserts.sql` — Permisos de inserción en inventario
4. `20260312150000_multi_user_support.sql` — Soporte multiusuario (user_id en inventory)
5. `20260312151500_allow_game_metadata_inserts.sql` — Inserción libre en games
6. `20260312152000_independent_user_collections.sql` — Colecciones independientes
7. `20260312172000_allow_public_read_for_dashboard.sql` — Lectura pública para el dashboard
8. `20260313000000_loans_indexes_and_rls.sql` — Índices y RLS para préstamos
9. `20260313140000_fix_loans_rls.sql` — Correcciones de políticas de préstamos
