<p align="center">
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Expo-SDK_52-000020?style=flat-square&logo=expo" />
  <img src="https://img.shields.io/badge/Supabase-Self--Hosted-3ecf8e?style=flat-square&logo=supabase" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/pnpm-Workspaces-f69220?style=flat-square&logo=pnpm" />
</p>

<h1 align="center">🎮 GameVault Ecosystem</h1>

<p align="center">
  <strong>Sistema de gestión de inventario de videojuegos con escáner de códigos de barras, préstamos entre usuarios y panel de administración web.</strong>
</p>

<p align="center">
  Pensado para comunidades, asociaciones y colecciones compartidas donde se necesita controlar quién tiene qué juego, cuándo se prestó y cuándo vuelve.
</p>

---

## 📸 Visión general

GameVault conecta dos aplicaciones — una **web para administradores** y una **app móvil para los miembros** — con un backend en Supabase que sincroniza todo en tiempo real.

**El flujo típico:**

1. Un usuario escanea el código de barras de un juego con su móvil
2. La app consulta automáticamente la API de IGDB para obtener la carátula y los datos
3. El juego queda registrado en el inventario del usuario
4. Desde el panel web, un admin puede ver toda la colección, gestionar préstamos y administrar usuarios

---

## 🏗️ Estructura del monorepo

```
gamevault-ecosystem/
├── apps/
│   ├── web/                    # Panel de administración (React + Vite)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── layout/     # Sidebar
│   │       │   ├── modals/     # GameDetail, LoanModal
│   │       │   ├── ui/         # Icon, Spinner, StatusBadge
│   │       │   └── views/      # CollectionView, LoanView, LoginView, UserManagement
│   │       ├── lib/            # Supabase client, helpers
│   │       └── types.ts        # Tipos compartidos
│   │
│   └── mobile/                 # App de usuario (React Native + Expo)
│       ├── app/(tabs)/         # Navegación por pestañas (Expo Router)
│       └── src/screens/        # Scanner, Login, Profile
│
├── supabase/
│   ├── functions/
│   │   └── get-game-details/   # Edge Function → busca en IGDB por código de barras
│   └── migrations/             # Esquema SQL incremental
│
├── packages/                   # (Reservado para tipos/config compartidos)
├── pnpm-workspace.yaml
└── package.json
```

---

## 🧩 Funcionalidades

### Panel Web (Admin Dashboard)

| Sección | Descripción |
|---------|-------------|
| **Colección** | Vista en cuadrícula o lista de todos los juegos. Filtros por estado (libre, prestado, mantenimiento) y búsqueda por título, código o usuario. |
| **Préstamos** | Registro de préstamos activos con fecha de vencimiento, indicador de retraso y botón de devolución. Historial completo de devoluciones. |
| **Usuarios** | Panel de gestión de roles (admin/student), reset de contraseña, y visualización de la colección de cada usuario. |
| **Sidebar** | Estadísticas en vivo, usuarios modificados recientemente, filtro rápido por colección de usuario e indicador de sincronización realtime. |

- Login con **email/contraseña** o **Twitch OAuth**
- Sincronización en tiempo real con Supabase Realtime (Postgres changes)
- Diseño dark con paleta emerald, pensado para lucir en presentaciones

### App Móvil

| Pantalla | Descripción |
|----------|-------------|
| **Escáner** | Cámara con overlay animado que detecta EAN-13 / UPC-A. Al escanear, consulta la Edge Function `get-game-details` para traer datos de IGDB. |
| **Mi Perfil** | Colección personal del usuario logueado con carátulas y estados. |
| **Login** | Autenticación con email/contraseña. |

### Backend (Supabase)

- **4 tablas principales**: `profiles`, `games`, `inventory_items`, `loans`
- **Row Level Security** en todas las tablas con políticas diferenciadas por rol
- **Trigger automático** para crear perfil al registrarse un usuario
- **Edge Function `get-game-details`**: recibe un código de barras, busca en OpenFoodFacts/UPCitemDB el título del producto, luego consulta IGDB para obtener la carátula y el resumen del juego

---

## ⚡ Puesta en marcha

### Requisitos previos

- Node.js ≥ 18
- pnpm (`corepack enable`)
- Supabase CLI (o usar `npx supabase`)
- Credenciales de Twitch para la API de IGDB → [dev.twitch.tv/console](https://dev.twitch.tv/console/apps)

### 1. Clonar e instalar

```bash
git clone https://github.com/SrGurmi/gamevault-ecosystem.git
cd gamevault-ecosystem
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Rellenar con tus credenciales de Twitch:

```env
TWITCH_CLIENT_ID=tu_id
TWITCH_CLIENT_SECRET=tu_secret
```

Las variables de Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) se configuran en `apps/web/.env`.

### 3. Base de datos

Si usas Supabase local:

```bash
npx supabase start
```

Las migraciones se aplican automáticamente al iniciar. Si tienes una instancia remota:

```bash
npx supabase db push --db-url "postgresql://postgres:PASSWORD@HOST:5432/postgres"
```

### 4. Arrancar las apps

```bash
# Web (panel admin)
pnpm dev:web

# Móvil (Expo)
pnpm dev:mobile
```

---

## 🗄️ Modelo de datos

> Consulta los detalles completos en [docs/DATABASE.md](docs/DATABASE.md)

```
profiles ←──── inventory_items ────→ games
    │                  │
    │                  ↓
    └──────────── loans
```

**Resumen rápido:**

- `profiles` → se crea automáticamente con un trigger al registrarse via Supabase Auth
- `games` → caché local de IGDB (id, título, carátula, resumen)
- `inventory_items` → enlaza un código de barras físico con un juego y un propietario
- `loans` → registra quién tiene prestado qué, con fechas y estado

---

## 🔐 Seguridad

Todas las tablas tienen **RLS habilitado** con las siguientes reglas generales:

- Los usuarios ven sus propios datos y los datos públicos de la colección
- Los admins tienen acceso completo de lectura
- Las inserciones en el inventario están restringidas al propietario
- Los préstamos solo pueden ser creados por usuarios autenticados y devueltos por admins

---

## 🛠️ Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend Web | React 18, Vite, Tailwind CSS v4 |
| Frontend Móvil | React Native, Expo SDK 52, Expo Router |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage) |
| API externa | IGDB (via Twitch), OpenFoodFacts, UPCitemDB |
| Monorepo | pnpm workspaces |
| Lenguaje | TypeScript 5 |
| Edge Functions | Deno |

---

## 📋 Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev:web` | Arranca el dashboard web en modo desarrollo |
| `pnpm dev:mobile` | Arranca Expo para la app móvil |
| `pnpm dev:all` | Arranca ambas apps en paralelo |

---

## 📄 Licencia

Proyecto académico / personal. Uso libre para fines educativos.

---

<p align="center">
  <sub>Desarrollado por <a href="https://github.com/SrGurmi">@SrGurmi</a></sub>
</p>
