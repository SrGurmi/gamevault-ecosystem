# 💬 Sistema de Chat — Detalle técnico

Documentación del sistema de mensajería en tiempo real implementado en `feat/mejoras`.

---

## Arquitectura

El chat utiliza **Supabase Realtime** para mantener las conversaciones sincronizadas entre todos los clientes conectados (web y móvil). No hay un servidor de WebSockets independiente — todo pasa por los canales de Postgres Changes que Supabase expone de forma nativa.

```
┌─────────────┐        ┌──────────────┐        ┌─────────────────┐
│  Web Client │◄──────►│   Supabase   │◄──────►│  Mobile Client  │
│  (ChatView) │  RT    │  (Realtime)  │   RT   │  (ChatScreen)   │
└─────────────┘        └──────┬───────┘        └─────────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  PostgreSQL  │
                       │  messages    │
                       │  conversations│
                       └──────────────┘
```

### Flujo de un mensaje

1. El usuario escribe y pulsa enviar
2. Se hace un `INSERT` en la tabla `messages` con `conversation_id`, `sender_id` y `content`
3. Un trigger actualiza `conversations.updated_at` automáticamente
4. Supabase Realtime detecta el cambio y notifica a todos los clientes suscritos a ese canal
5. Los clientes vuelven a hacer un `SELECT` de los mensajes de esa conversación
6. La lista de conversaciones también se refresca (para actualizar el preview del último mensaje)

### Suscripciones Realtime

Cada cliente crea dos canales:

```typescript
// Canal global — detecta cualquier mensaje nuevo para refrescar la lista
supabase.channel(`conversations-${userId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, callback)

// Canal de conversación — solo mensajes de la conversación seleccionada
supabase.channel(`messages-${conversationId}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, callback)
```

---

## Tablas

### `conversations`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK, auto-generado |
| `name` | TEXT | `NULL` para directos, nombre manual para grupos |
| `type` | TEXT | `'direct'` o `'group'` |
| `created_by` | UUID | FK → profiles. Quién inició la conversación |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Se actualiza con cada mensaje nuevo (trigger) |

### `conversation_participants`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `conversation_id` | UUID | FK → conversations |
| `user_id` | UUID | FK → profiles |
| `joined_at` | TIMESTAMPTZ | |
| `last_read_at` | TIMESTAMPTZ | Preparado para marcar mensajes como leídos |

Restricción `UNIQUE(conversation_id, user_id)` — un usuario no puede estar dos veces en la misma conversación.

### `messages`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `conversation_id` | UUID | FK → conversations |
| `sender_id` | UUID | FK → profiles |
| `content` | TEXT | Máximo 2000 caracteres (CHECK constraint) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ | Soft delete — `NULL` si el mensaje está activo |

### Índices

```sql
idx_messages_conversation_id            -- Filtrar mensajes por conversación
idx_messages_sender_id                  -- Buscar mensajes de un usuario
idx_messages_created_at                 -- Ordenar cronológicamente (DESC)
idx_conversation_participants_user_id   -- Buscar conversaciones de un usuario
idx_conversation_participants_conversation_id
```

---

## Políticas RLS

### Conversaciones

- **SELECT**: El usuario debe ser participante de la conversación, o ser admin
- **INSERT**: Cualquier usuario autenticado puede crear conversaciones

### Participantes

- **SELECT**: Solo ves tus propias participaciones (o eres admin)
- **INSERT**: Cualquier usuario autenticado
- **UPDATE**: Solo el propio usuario (para actualizar `last_read_at`)

### Mensajes

- **SELECT**: Solo participantes de la conversación (o admin)
- **INSERT**: El `sender_id` debe coincidir con `auth.uid()`, y el usuario debe ser participante
- **UPDATE**: Solo el autor del mensaje o un admin (para soft delete)

---

## Implementación en el frontend

### Web (`ChatView.tsx`)

Componente dividido en dos paneles:

1. **Lista de conversaciones** (izquierda, 320px fijo)
   - Muestra nombre, avatar del otro participante, último mensaje y timestamp
   - Botón `+` para iniciar conversaciones nuevas
   - Selector de usuarios al crear conversación nueva

2. **Panel de mensajes** (derecha, flex)
   - Header con info del participante
   - Lista de mensajes con burbujas diferenciadas (verde para propios, semitransparente para ajenos)
   - Input con botón de envío
   - Auto-scroll al recibir mensajes nuevos

### Móvil (`ChatScreen.tsx`)

Navegación en dos niveles:

1. **Lista de conversaciones** — FlatList con avatares, previews y timestamps
2. **Vista de mensajes** — FlatList invertida con burbujas, input y KeyboardAvoidingView

La lógica de negocio (fetch, realtime, envío) es prácticamente idéntica a la web pero adaptada al modelo de React Native con `FlatList`, `TouchableOpacity` y `StyleSheet`.

---

## Limitaciones conocidas

- **No hay typing indicators** — no se envía señal de "escribiendo…"
- **Sin lectura de mensajes** — el campo `last_read_at` existe pero no se usa aún para calcular unread count
- **Grupos** — las tablas lo soportan pero la UI solo permite conversaciones directas por ahora
- **Sin paginación** — se cargan todos los mensajes de golpe. Funciona bien para volúmenes bajos pero necesitará cursor-based pagination si escala
- **Archivos/imágenes** — solo texto plano por ahora
