<p align="center">
  <img src="https://img.shields.io/badge/branch-feat%2Fmejoras-ff6b6b?style=flat-square" />
  <img src="https://img.shields.io/badge/status-en_desarrollo-ffcc00?style=flat-square" />
</p>

<h1 align="center">🎮 GameVault Ecosystem — <code>feat/mejoras</code></h1>

<p align="center">
  <strong>Rama de desarrollo con nuevas funcionalidades:<br>chat en tiempo real, fotos de perfil y sistema de notificaciones.</strong>
</p>

---

## 🔀 ¿Qué hay en esta rama?

Esta rama extiende la base estable de `main` con tres módulos nuevos que añaden comunicación y personalización al ecosistema. Todavía está en desarrollo activo, pero las funcionalidades principales ya son operativas.

### ✅ Cambios respecto a `main`

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| 💬 [Chat en tiempo real](#-chat-en-tiempo-real) | ✅ Funcional | Mensajería directa entre usuarios con sincronización realtime |
| 📷 [Fotos de perfil](#-fotos-de-perfil) | ✅ Funcional | Subida de avatares a Supabase Storage |
| 🔔 [Notificaciones push](#-sistema-de-notificaciones) | 🔧 Esquema listo | Tablas y preferencias creadas, pendiente la integración con Expo Notifications |

---

## 💬 Chat en tiempo real

Sistema de mensajería integrado tanto en la web como en la app móvil. Permite a los administradores comunicarse con los usuarios directamente desde el dashboard.

### Cómo funciona

- Se pueden iniciar conversaciones directas seleccionando un usuario
- Los mensajes se sincronizan en tiempo real via Supabase Realtime (Postgres Changes)
- Soporte para conversaciones de grupo (tablas preparadas, UI pendiente)
- Soft delete en mensajes — se marcan con `deleted_at` en vez de eliminarse

### Archivos nuevos

```
apps/web/src/components/views/ChatView.tsx      # Vista de chat en el dashboard
apps/mobile/src/screens/ChatScreen.tsx          # Pantalla de chat en la app
apps/mobile/app/(tabs)/chat.tsx                 # Tab de chat en la navegación
supabase/migrations/20260403000002_add_chat_system.sql
```

### Modelo de datos del chat

```
┌────────────────┐     ┌──────────────────────────┐     ┌───────────┐
│ conversations  │     │ conversation_participants │     │ messages  │
│────────────────│     │──────────────────────────│     │───────────│
│ id (PK)        │◄────│ conversation_id (FK)      │     │ id (PK)   │
│ name           │     │ user_id (FK) ────────────────►  profiles   │
│ type           │     │ joined_at                 │     │ conv_id   │
│ created_by     │     │ last_read_at              │     │ sender_id │
│ created_at     │     └──────────────────────────┘     │ content   │
│ updated_at     │◄─────────────────────────────────────│ created_at│
└────────────────┘                                      │ deleted_at│
                                                        └───────────┘
```

> Detalles completos en [docs/CHAT.md](docs/CHAT.md)

### Seguridad (RLS)

- Solo los participantes de una conversación pueden leer sus mensajes
- Los admins tienen acceso de lectura a todas las conversaciones
- Un usuario solo puede enviar mensajes en conversaciones donde participa
- Solo el autor (o un admin) puede marcar un mensaje como eliminado

---

## 📷 Fotos de perfil

Los usuarios ahora pueden subir su propia foto de perfil, que se almacena en un bucket de Supabase Storage.

### Configuración del bucket

- Nombre: `avatars`
- Acceso público (las imágenes son visibles sin autenticación)
- Límite: 5 MB por archivo
- Formatos permitidos: JPEG, PNG, WebP
- Estructura: `avatars/{user_id}/avatar.{ext}`

### Políticas de acceso

| Acción | Quién puede |
|--------|-------------|
| Ver | Cualquiera (bucket público) |
| Subir | Solo el propietario de la carpeta (`user_id` coincide) |
| Actualizar | Solo el propietario |
| Eliminar | Solo el propietario |

### Migración

```
supabase/migrations/20260403000000_add_storage_avatars.sql
```

---

## 🔔 Sistema de notificaciones

Infraestructura de base de datos para notificaciones push. Las tablas ya están creadas y securizadas, pero la integración con `expo-notifications` está pendiente.

### Tablas nuevas

#### `device_tokens`

Almacena los tokens de push de cada dispositivo registrado.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | Referencia a `profiles` |
| `token` | TEXT | Token del dispositivo (Expo push token) |
| `platform` | TEXT | `'ios'`, `'android'` o `'web'` |
| `created_at` | TIMESTAMPTZ | |

#### `notification_preferences`

Preferencias de cada usuario sobre qué notificaciones quiere recibir.

| Campo | Tipo | Default |
|-------|------|---------|
| `user_id` | UUID (FK, UNIQUE) | |
| `loan_reminders` | BOOLEAN | `true` |
| `new_loans` | BOOLEAN | `true` |
| `system_alerts` | BOOLEAN | `true` |
| `weekly_report` | BOOLEAN | `false` |

- Las preferencias se crean automáticamente con un trigger cuando se crea un perfil nuevo
- Cada usuario solo puede ver y modificar sus propias preferencias
- Los admins pueden leer todos los device tokens (necesario para enviar notificaciones)

### Migración

```
supabase/migrations/20260403000001_add_notifications.sql
```

---

## 🚀 Cómo probar esta rama

```bash
# Cambiar a la rama
git checkout feat/mejoras

# Instalar dependencias (si hay cambios)
pnpm install

# Arrancar Supabase local y aplicar migraciones
npx supabase start

# Las nuevas migraciones (chat, avatars, notifications) se aplican automáticamente

# Arrancar las apps
pnpm dev:web      # Dashboard con pestaña "Mensajes"
pnpm dev:mobile   # App con tab "Chat"
```

### Verificar que todo funciona

1. **Chat web**: Entra al dashboard → Sidebar → Mensajes → Crea una conversación
2. **Chat móvil**: Abre la app → Tab "Chat" → Nuevo mensaje
3. **Avatares**: En la app móvil → Mi Perfil → (la subida depende de la pantalla de cuenta)

---

## 🗺️ Pendiente en esta rama

- [ ] Integración completa con `expo-notifications` para push real
- [ ] Indicador de mensajes no leídos (el campo `last_read_at` ya está en la tabla)
- [ ] Conversaciones de grupo (UI) — las tablas ya lo soportan
- [ ] Pantalla de ajustes de notificaciones en la app móvil
- [ ] Confirmación visual al subir un avatar nuevo

---

## 📎 Documentación relacionada

- [README principal (main)](../README.md)
- [Modelo de base de datos](docs/DATABASE.md)
- [Detalle del sistema de chat](docs/CHAT.md)

---

<p align="center">
  <sub>Desarrollado por <a href="https://github.com/SrGurmi">@SrGurmi</a></sub>
</p>
