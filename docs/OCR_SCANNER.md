# 🔍 OCR Scanner — Reconocimiento de carátulas

Documentación técnica del escáner por carátula introducido en la rama `feature/ocr_scanner`. Esta funcionalidad **complementa** (no reemplaza) el escáner de códigos de barras EAN-13 / UPC-A ya existente.

> Resumen rápido: el usuario apunta la cámara a la carátula del juego, captura una foto, y el backend extrae el título por OCR, lo limpia, lo resuelve contra IGDB y devuelve el juego listo para ser persistido — la misma forma que ya devolvía la búsqueda por código de barras.

---

## 🧭 Motivación

El escáner de códigos de barras falla en varios escenarios reales:

| Caso | Probabilidad de fallo |
|------|----------------------|
| Caja sin código de barras (compactas, sueltas, importadas) | Alta |
| Código dañado o tapado por etiquetas de tienda | Media |
| Ediciones limitadas con barcodes no registrados en UPC databases | Media |
| Juegos retro pre-2000 | Muy alta |

El OCR de carátula resuelve la mayoría: cualquier juego con título legible en la portada puede ser identificado, incluso si nunca pasó por una base de datos de productos.

---

## 🏗️ Arquitectura

```
┌──────────────────────────┐
│  ScannerScreen (mobile)  │
│  ┌────────────────────┐  │
│  │ Toggle EAN / OCR   │  │
│  └────────────────────┘  │
│  │ Camera + Capture  │   │
└──────────┬───────────────┘
           │
           │  base64 (≤700KB)  ─────────────┐
           │  ó                              │
           │  upload + signed URL (>700KB) ──┤
           ▼                                 │
   ┌───────────────────┐                     │
   │  storage bucket   │                     │
   │  game-covers      │  (private, RLS)     │
   └───────────────────┘                     │
                                             ▼
                          ┌──────────────────────────────┐
                          │  Edge Function (Deno)        │
                          │  recognize-game-cover        │
                          │                              │
                          │  1. OCR provider             │
                          │     (ocr_space | google)     │
                          │  2. Title candidates         │
                          │     (stop-words + dedupe)    │
                          │  3. IGDB multi-search        │
                          │  4. Rank by word overlap     │
                          └──────┬───────────────────────┘
                                 │
                                 │ IGDB game obj + _ocr debug
                                 ▼
                          ┌──────────────────┐
                          │  persistGame()   │
                          │  - games upsert  │
                          │  - inventory_    │
                          │    items insert  │
                          └──────────────────┘
```

### Componentes nuevos en la rama

| Componente | Path |
|-----------|------|
| Edge Function OCR | `supabase/functions/recognize-game-cover/index.ts` |
| Helpers IGDB compartidos | `supabase/functions/_shared/igdb.ts` |
| Migration storage bucket | `supabase/migrations/20260512000000_add_storage_game_covers.sql` |
| Integración mobile | `apps/mobile/src/screens/ScannerScreen.tsx` (extendido) |
| Config Functions | `supabase/config.toml.example` (entries añadidas) |

---

## 🔄 Workflows

### Workflow A — Barcode (existente, intacto)

```
[user] apunta a EAN-13
   ↓
[CameraView.onBarcodeScanned] detecta código
   ↓
[saveToInventory(barcode)] invoca get-game-details
   ↓
[get-game-details] external_games lookup → IGDB game
   ↓ (si falla)
[get-game-details] UPCitemDB fallback → IGDB search
   ↓
[persistGame()] upsert games + insert inventory_items
```

### Workflow B — OCR carátula (nuevo)

```
[user] cambia a modo OCR → encuadra carátula → pulsa "Capturar"
   ↓
[CameraView.takePictureAsync({ quality: 0.35, base64: true })]
   ↓
[buildOcrBody(base64, uri)]
   ├── base64 ≤700KB → { imageBase64, mimeType }
   └── base64 >700KB → upload bucket privado → signed URL 60s → { imageUrl }
   ↓
[invoke recognize-game-cover]
   ↓ (Edge Function)
   1. provider.recognize() → rawText + lines[]
   2. pickTitleCandidates() → top 5 strings
   3. para cada candidate: searchIgdb + rankByTitle
   4. score ≥ 0.7 → early stop. score < 0.25 → 404 con candidate
   ↓
[persistGame(gameData, `ocr-${gameId}-${ts}`)]
```

### Workflow C — Fallback manual (existente, reusado por OCR)

```
[recognize-game-cover devuelve 404 con _ocr.candidate]
   ↓
[ScannerScreen] abre modal manual prefilled con candidate
   ↓
[user] edita texto si quiere → "Buscar y Añadir"
   ↓
[saveManual] invoca get-game-details con { searchQuery }
   ↓
[persistGame(gameData, `manual-${ts}`)]
```

---

## 🗄️ Estructura de base de datos

### Tablas existentes (sin cambios)

Las tablas core (`games`, `inventory_items`, `profiles`, `loans`) **no se modifican**. El OCR persiste exactamente igual que el barcode scan, generando un `barcode` sintético con prefijo `ocr-`:

```
inventory_items
├── id          uuid PK
├── game_id     int   FK → games.id
├── barcode     text  UNIQUE — `ocr-<igdbId>-<ts>` para escaneos OCR
├── user_id     uuid  FK → profiles.id
├── status      text  ('available' | 'loaned' | 'maintenance')
└── created_at  timestamptz
```

> Decisión de diseño: no se añade columna `source` (barcode/ocr/manual) porque el prefijo en `barcode` ya es discriminante y mantiene retro-compatibilidad con consultas existentes en `apps/web`.

### Storage — nuevo bucket `game-covers`

Migration: `20260512000000_add_storage_game_covers.sql`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'game-covers',
  'game-covers',
  false,         -- privado
  3145728,       -- 3MB hard cap
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

**Layout de archivos:**

```
game-covers/
└── <user_id>/
    └── <timestamp>.jpg
```

**RLS policies:**

| Operación | Regla |
|-----------|-------|
| INSERT | `auth.uid()::text = (storage.foldername(name))[1]` — solo en carpeta propia |
| SELECT | Mismo criterio (necesario para generar signed URLs) |
| DELETE | Mismo criterio (permite cleanup manual ó cron job) |

**Ciclo de vida:**

1. Mobile sube `<uid>/<ts>.jpg`
2. Mobile pide signed URL con TTL 60s
3. Edge Function descarga via signed URL → OCR
4. Imagen queda huérfana hasta cleanup (futuro: cron job que borre archivos >24h)

---

## ⚙️ Edge Function — `recognize-game-cover`

### Request

```typescript
POST /functions/v1/recognize-game-cover
Content-Type: application/json
Authorization: Bearer <anon|user JWT>

{
  imageBase64?: string,   // dataURL ó base64 raw
  imageUrl?: string,      // signed URL ó URL pública
  mimeType?: string,      // default "image/jpeg"
  hintTitle?: string,     // opcional: sesgo de búsqueda
  language?: string       // ISO 639-1, default "eng"
}
```

> Exactly one de `imageBase64` o `imageUrl` es requerido.

### Response — 200 OK

```typescript
{
  id: number,                    // IGDB game id
  name: string,                  // título oficial IGDB
  summary?: string,
  cover?: { url: string },       // ya con t_cover_big aplicado
  first_release_date?: number,   // unix ts
  platforms?: number[],
  _ocr: {
    rawText: string,             // texto completo extraído
    candidate: string,           // título que matcheó
    provider: 'ocr_space' | 'google_vision' | 'azure',
    confidence: number | null,
    matchScore: number           // 0–1 word overlap
  }
}
```

### Response — 404 (no match)

```typescript
{
  error: string,
  _ocr: {
    rawText: string,
    candidate: string,
    topMatches: Array<{ title: string, score: number }>
  }
}
```

> El cliente usa `_ocr.candidate` para pre-rellenar la búsqueda manual.

### Response — 400 (bad input)

```typescript
{ error: 'Se requiere imageBase64 o imageUrl' }
```

### Pipeline interno

```
1. parse body & validate
2. provider = getOcrProvider()  // env-driven
3. ocr = await provider.recognize({ base64|url, language })
   - OCR.space: form POST con base64Image ó url
   - Google Vision: JSON POST con content (b64) ó source.imageUri
4. candidates = pickTitleCandidates(ocr.lines, hintTitle)
   - replace caracteres no [letra|num|espacio]
   - filtrar stop-words (NINTENDO, EDITION, PEGI, ...)
   - dedupe case-insensitive
   - sort por longitud desc, top 5
5. for candidate in candidates:
   results = await searchIgdb(candidate)
   scored = rankByTitle(candidate, results)
   if scored[0].score > bestScore: bestMatch = scored[0]
   if scored[0].score ≥ 0.7: break  // early stop
6. if bestScore < 0.25: return 404 con candidates
7. return fixCoverUrl(bestMatch.game) + _ocr debug
```

### Provider abstraction

```typescript
interface OcrProvider {
  name: OcrProviderName
  recognize(input: {
    base64?: string
    url?: string
    mimeType?: string
    language: string
  }): Promise<OcrResult>
}
```

| Provider | Status | Notas |
|----------|--------|-------|
| `ocr_space` | ✅ implementado | Free tier 25k req/mes, límite 1MB, Engine 2 |
| `google_vision` | ✅ implementado | Requiere `GOOGLE_CLOUD_VISION_KEY`. Más caro, mejor accuracy |
| `azure` | ⚠️ stub | Lanza error si se selecciona |

Swap via env var `OCR_PROVIDER`.

### Title extraction — STOP_WORDS

Filtra ruido típico de carátulas para que `searchIgdb` reciba el título limpio:

```
Plataformas:   NINTENDO, SWITCH, PLAYSTATION, PS3-5, XBOX, WII, WIIU,
               3DS, DS, PSP, VITA, PC
Publishers:    SEGA, CAPCOM, UBISOFT, EA
Ediciones:     EDITION, LIMITED, COLLECTOR, DELUXE, ULTIMATE, PREMIUM, GOLD
Regiones:      PAL, NTSC, USA, EUR
Marketing:     COMPLETE, GOTY, BUNDLE, GAME, ONLY, EXCLUSIVE,
               DIGITAL, PHYSICAL, COPY, OFFLINE, ONLINE
Clasificación: PEGI, ESRB, AGES
```

### Word overlap scoring

```typescript
score = |source_words ∩ candidate_words| / |source_words|
```

Words shorter than 2 chars son descartados. Threshold 0.25 mínimo, early-stop ≥0.7.

---

## 📱 Mobile — integración en ScannerScreen

### State machine

```
mode: 'barcode' | 'cover'

[BARCODE]
  └── onBarcodeScanned → saveToInventory → get-game-details

[COVER]
  └── pulsa "Capturar" → captureCover → buildOcrBody → recognize-game-cover

ambos:
  └── fallo → showManual → saveManual → get-game-details (searchQuery)
```

### switchMode

Reset limpio al cambiar de modo:

```typescript
const switchMode = (next: ScanMode) => {
  if (isSaving || mode === next) return
  isLockedRef.current = false
  setScanned(false)
  setShowManual(false)
  setManualQuery("")
  setPendingBarcode(null)
  setMode(next)
}
```

Bloqueado durante `isSaving` para no cancelar una operación en curso.

### buildOcrBody — estrategia adaptativa

```typescript
const STORAGE_THRESHOLD = 700_000  // bytes

if (estBytes ≤ 700KB) → { imageBase64, mimeType }
else                  → upload bucket → signedUrl(60s) → { imageUrl }
```

| Caso | Latencia añadida | Coste |
|------|------------------|-------|
| Imagen pequeña (base64 directo) | ~0ms extra | 1 round-trip |
| Imagen grande (storage path) | ~300-800ms upload | 3 round-trips (upload + sign + invoke) |

### Animación

`scanLine` ahora gateada por `mode === "barcode"`. En modo OCR la animación se detiene (`scanAnim.stopAnimation()`) para no derrochar frame budget.

### Barcode sintético

Los inventory_items creados por OCR usan:

```
barcode = `ocr-${igdbId}-${Date.now()}`
```

Esto evita colisión con UPC/EAN reales (12-13 dígitos), permite recovery del igdbId desde el barcode (debug), y respeta la columna `UNIQUE`.

---

## ⚙️ Configuración

### Variables de entorno

```env
# Existentes (sin cambio)
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...

# Nuevas
OCR_PROVIDER=ocr_space              # opcional, default
OCR_SPACE_API_KEY=K12345...         # get from ocr.space/ocrapi (free tier)
GOOGLE_CLOUD_VISION_KEY=...           # solo si OCR_PROVIDER=google_vision
```

### config.toml

```toml
[functions.get-game-details]
verify_jwt = false
import_map = "./functions/import_map.json"

[functions.recognize-game-cover]
verify_jwt = false
import_map = "./functions/import_map.json"

[functions.send-notification]
verify_jwt = true
import_map = "./functions/import_map.json"
```

> `verify_jwt = false` permite que mobile invoque con anon key. La lógica de auth se hace en mobile (el `persistGame` requiere user autenticado para el INSERT en inventory_items via RLS).

---

## 🚀 Deploy

```bash
# 1. Apply migration (crea bucket game-covers + RLS)
npx supabase db push

# 2. Configurar secrets en Supabase
npx supabase secrets set OCR_SPACE_API_KEY=tu_key
# opcional:
npx supabase secrets set OCR_PROVIDER=ocr_space

# 3. Deploy funciones
npx supabase functions deploy recognize-game-cover

# 4. Verificar
curl -X POST \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/cover.jpg"}' \
  https://<project>.supabase.co/functions/v1/recognize-game-cover
```

---

## 🧪 Test plan

### Manual smoke tests

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| 1 | Modo Barcode + EAN válido | Persiste juego ✓ |
| 2 | Modo Barcode + EAN no registrado | Manual modal abre |
| 3 | Toggle a OCR + carátula común (Mario Kart, Zelda) | Persiste juego ✓ |
| 4 | OCR + carátula ilegible / borrosa | Manual modal con candidate prefilled |
| 5 | OCR + foto >700KB | Upload a bucket → signed URL → OK |
| 6 | OCR + foto <700KB | base64 inline → OK |
| 7 | Toggle EAN→OCR durante isSaving | Toggle bloqueado, espera completar |
| 8 | OCR sin sesión autenticada (anon) | Persist falla en RLS — mostrar error |

### Edge cases

- Carátula con texto en otro idioma → setear `language` (ej. `"spa"`) en la request
- Múltiples ediciones del mismo juego → IGDB devuelve el más popular (ranking interno)
- Re-escaneo del mismo juego → `inventory_items_barcode_unique` falla con 23505 → mensaje "ya está en tu colección"

---

## 📊 Performance characteristics

| Operación | Latencia típica |
|-----------|----------------|
| `takePictureAsync({ quality: 0.35 })` | 80-200ms |
| Upload a storage (foto ~1MB) | 300-800ms |
| Signed URL creation | 50-100ms |
| OCR.space (Engine 2, 1MB image) | 1500-3500ms |
| Google Vision (TEXT_DETECTION) | 600-1200ms |
| IGDB token fetch | 200-300ms |
| IGDB search (1 query) | 300-500ms |
| **Total típico (base64 + ocr_space)** | **~2.5-4s** |
| **Total típico (storage + google)** | **~2-3s** |

### Optimizaciones aplicadas

- **Quality 0.35** en `takePictureAsync` → JPEG ~500-900KB
- **Early stop** ≥0.7 → corta el bucle de candidates
- **`skipProcessing: true`** → sin filtros nativos de la cámara
- **`scanAnim.stopAnimation()`** en modo OCR → ahorra frames

---

## 🔐 Seguridad

- Bucket `game-covers` es **privado** — solo el dueño accede a sus uploads
- Signed URLs con TTL 60s — suficiente para OCR roundtrip, se invalida después
- RLS por user folder previene cross-tenant access
- Edge Function valida `imageBase64 XOR imageUrl` antes de cualquier llamada externa
- API keys (`OCR_SPACE_API_KEY`, `GOOGLE_CLOUD_VISION_KEY`, `TWITCH_*`) viven en Supabase Secrets, nunca expuestas al cliente
- El cliente mobile NO necesita ningún key extra — sigue usando `EXPO_PUBLIC_SUPABASE_ANON_KEY`

---

## 🐛 Troubleshooting

### "Missing OCR_SPACE_API_KEY"
→ `npx supabase secrets set OCR_SPACE_API_KEY=...`

### "OCR.space: file size exceeded"
→ Imagen >1MB en base64 mode. Revisar `STORAGE_THRESHOLD` en mobile ó bajar `quality` del takePictureAsync.

### 404 con `topMatches` vacío
→ OCR no extrajo nada legible. Posibles causas: foto desenfocada, reflejo en la caja, ángulo demasiado oblicuo, fuente muy estilizada.

### 404 con `topMatches` pobladas pero score <0.25
→ OCR sí extrajo texto pero IGDB no tiene un match razonable. El usuario debe usar manual search con un nombre alternativo.

### Imagen sube al bucket pero la fn devuelve "fetch failed"
→ Signed URL expiró (TTL 60s). Posiblemente latencia de red excesiva. Subir TTL en `createSignedUrl(path, 120)`.

### "Storage RLS error" al subir
→ Usuario no autenticado, ó migration `20260512000000` no aplicada. Verificar `npx supabase migration list`.

---

## 🔮 Mejoras futuras

| Idea | Beneficio | Esfuerzo |
|------|-----------|---------|
| `expo-image-manipulator` para resize/crop antes de OCR | Reduce coste de bytes + mejor OCR | Bajo |
| Cron job para borrar uploads >24h en `game-covers` | Mantiene bucket bajo control | Medio |
| Soporte Azure Vision (provider stub) | Redundancia/coste alternativo | Bajo |
| Cache de OCR results por hash de imagen | Re-escaneos instantáneos | Medio |
| Detección de barcode dentro de la foto OCR | Hybrid mode — best of both | Alto |
| Pre-clasificación con CLIP/embedding antes de búsqueda IGDB | Disambiguación cuando OCR es ambiguo | Alto |
| Modal de confirmación con `topMatches` cuando score 0.25-0.5 | Mejor UX en casos dudosos | Bajo |

---

## 📁 Apéndice — Estructura del módulo `_shared`

`supabase/functions/_shared/igdb.ts` exporta helpers reutilizables por cualquier Edge Function que necesite IGDB. Actualmente solo es consumido por `recognize-game-cover` — `get-game-details` mantiene su implementación inline original.

```typescript
// Re-utilizables
export const corsHeaders
export interface IgdbGame
export interface ScoredGame

export function jsonResponse(payload, status): Response
export async function getIgdbHeaders(): Promise<Headers>  // cached token
export async function fetchGameById(id, headers?): Promise<IgdbGame | null>
export async function searchIgdb(q, opts?): Promise<IgdbGame[]>
export async function lookupByBarcode(b, headers?): Promise<...>
export function fixCoverUrl(game): IgdbGame
export function wordOverlapScore(a, b): number
export function rankByTitle(q, games): ScoredGame[]
```

**Token caching**: `getIgdbHeaders` cachea el access_token de Twitch en memoria del runtime con margen de 60s antes de expirar. Reduce ~200ms por invocación en warm starts.

---

<p align="center">
  <sub>📄 Documentación de la rama <code>feature/ocr_scanner</code></sub>
</p>
