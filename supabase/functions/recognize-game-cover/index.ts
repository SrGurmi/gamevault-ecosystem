import { serve } from "std/server"
import {
  corsHeaders,
  jsonResponse,
  getIgdbHeaders,
  searchIgdb,
  fixCoverUrl,
  fetchGameById,
  type IgdbGame,
} from "../_shared/igdb.ts"

/* ─────────────────────────────────────────────────────────────────────────────
 * recognize-game-cover  v2
 * ──────────────────────────────────────────────────────────────────────────────
 * Order:
 *   1. Gemini Flash Vision — asks the model directly "what game is this?" and
 *      gets back a JSON with name + platform. MUCH more accurate than OCR on
 *      artistic / stylised cover fonts.
 *   2. OCR.space (legacy fallback) — used when GEMINI_API_KEY is not set.
 *      Two-engine dual-pass, then franchise-aware IGDB search.
 *
 * Request body:
 *   { imageBase64?: string, imageUrl?: string, mimeType?: string }
 *
 * Env vars:
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET  — required always
 *   GEMINI_API_KEY                          — primary provider (recommended)
 *   OCR_SPACE_API_KEY                       — legacy fallback
 * ───────────────────────────────────────────────────────────────────────────── */

interface RequestBody {
  imageBase64?: string
  imageUrl?: string
  mimeType?: string
  hintTitle?: string
  language?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Word-overlap score that handles accents and is case-insensitive.
 * "Pokémon" vs "Pokemon" → still counts as a hit.
 */
function overlapScore(query: string, candidate: string): number {
  const tokenize = (s: string) =>
    stripAccents(s).toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 1)
  const src = new Set(tokenize(query))
  const cnd = new Set(tokenize(candidate))
  if (src.size === 0) return 0
  let hits = 0
  for (const w of src) if (cnd.has(w)) hits++
  return hits / src.size
}

function rankResults(query: string, games: IgdbGame[]) {
  return games
    .map(g => ({ game: g, score: overlapScore(query, g.name) }))
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.05) {
        return (b.game.total_rating_count ?? 0) - (a.game.total_rating_count ?? 0)
      }
      return b.score - a.score
    })
}

/**
 * Try IGDB search with multiple fallback strategies:
 * with-filter → no-filter → accent-stripped.
 */
async function robustIgdbSearch(
  title: string,
  igdbH: Record<string, string>,
  platform?: number | null,
): Promise<IgdbGame[]> {
  const safe = (t: string) => t.replace(/"/g, '\\"')

  // 1. Official categories + optional platform
  let results = await searchIgdb(title, { headers: igdbH, officialOnly: true, platformId: platform ?? null })

  // 2. Drop platform filter
  if (results.length === 0 && platform) {
    results = await searchIgdb(title, { headers: igdbH, officialOnly: true })
  }

  // 3. No category filter at all
  if (results.length === 0) {
    const r = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST', headers: igdbH,
      body: `search "${safe(title)}"; fields name, summary, cover.url, first_release_date, platforms, category, total_rating_count; limit 15;`,
    })
    if (r.ok) results = (await r.json()) ?? []
  }

  // 4. Accent-stripped variant
  const stripped = stripAccents(title)
  if (results.length === 0 && stripped !== title) {
    const r = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST', headers: igdbH,
      body: `search "${safe(stripped)}"; fields name, summary, cover.url, first_release_date, platforms, category, total_rating_count; limit 15;`,
    })
    if (r.ok) results = (await r.json()) ?? []
  }

  return Array.isArray(results) ? results : []
}

// ── Provider 1: Gemini Flash Vision ──────────────────────────────────────────

interface GeminiIdentification {
  game_title: string
  platform: string | null
  confidence: 'high' | 'medium' | 'low'
  alt_titles?: string[]
}

async function identifyWithGemini(
  base64?: string,
  imageUrl?: string,
  mimeType = 'image/jpeg',
): Promise<GeminiIdentification | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return null

  // Build the image part
  let imagePart: Record<string, unknown>
  if (base64) {
    const data = base64.startsWith('data:') ? base64.split(',')[1] : base64
    imagePart = { inlineData: { data, mimeType } }
  } else if (imageUrl) {
    // Fetch the URL and convert to base64 inline for Gemini
    const resp = await fetch(imageUrl).catch(() => null)
    if (!resp?.ok) return null
    const buf = await resp.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    imagePart = { inlineData: { data: b64, mimeType } }
  } else {
    return null
  }

  const prompt = `You are a video game expert. Look at this game box/cover image and identify the game.
Return ONLY a JSON object (no markdown, no explanation) with this exact shape:
{
  "game_title": "exact English title as it appears in IGDB",
  "platform": "platform name (e.g. Nintendo 3DS, PlayStation 4, Nintendo Switch) or null if unclear",
  "confidence": "high" | "medium" | "low",
  "alt_titles": ["alternative title 1", "..."]
}

Rules:
- game_title should be the international/English title (e.g. "Pokémon Alpha Sapphire" not "Pokémon Zafiro Alfa")
- If you are not sure, set confidence to "low" and still give your best guess
- alt_titles: include regional variants, subtitle-only versions, franchise-only name as fallback
- Never return null for game_title; always attempt an identification`

  const body = {
    contents: [{ parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,  // Low temperature for factual tasks
      maxOutputTokens: 256,
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error(`Gemini HTTP ${res.status}:`, errText.slice(0, 300))
    return null
  }

  const json = await res.json()
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  console.log('Gemini raw response:', text.slice(0, 500))

  try {
    // Strip markdown code fences if present (some models add them despite instruction)
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(cleaned) as GeminiIdentification
  } catch {
    console.error('Failed to parse Gemini JSON:', text)
    return null
  }
}

// ── Provider 2: OCR.space (legacy fallback) ───────────────────────────────────

async function callOcrSpace(
  apiKey: string,
  engine: '1' | '2',
  input: { base64?: string; url?: string; mimeType?: string; language: string },
): Promise<string> {
  const form = new FormData()
  form.append('language', input.language)
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', engine)
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')

  if (input.url) {
    form.append('url', input.url)
  } else if (input.base64) {
    const dataUrl = input.base64.startsWith('data:')
      ? input.base64
      : `data:${input.mimeType ?? 'image/jpeg'};base64,${input.base64}`
    form.append('base64Image', dataUrl)
  }

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
  })
  if (!res.ok) throw new Error(`OCR.space HTTP ${res.status}`)
  const json = await res.json()
  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : json.ErrorMessage
    throw new Error(`OCR.space: ${msg}`)
  }
  return (json.ParsedResults?.[0]?.ParsedText ?? '') as string
}

// Known franchise names for OCR fallback path
const KNOWN_FRANCHISES = [
  'Pokemon', 'Pokémon', 'Mario', 'Zelda', 'Metroid', 'Kirby', 'Donkey Kong', 'Yoshi',
  'Fire Emblem', 'Animal Crossing', 'Splatoon', 'Pikmin', 'Final Fantasy', 'Dragon Quest',
  'Monster Hunter', 'Dark Souls', 'God of War', 'Uncharted', 'Spider-Man',
  'FIFA', 'PES', 'Call of Duty', 'Battlefield', 'Halo', 'Resident Evil',
  'Sonic', 'Persona', 'Yakuza', 'Tekken', 'Assassin',
]

const STOP_WORDS = new Set([
  'EDITION', 'LIMITED', 'COLLECTOR', 'DELUXE', 'ULTIMATE', 'PREMIUM', 'GOLD',
  'PAL', 'NTSC', 'USA', 'EUR', 'COMPLETE', 'GOTY', 'BUNDLE', 'GAME',
  'ONLY', 'EXCLUSIVE', 'DIGITAL', 'PHYSICAL', 'PEGI', 'ESRB', 'THE', 'AND', 'FOR',
])

const STOP_SUBSTRINGS = [
  'NINTEND', 'PLAYSTATION', 'XBOX', 'COMPANY', 'CORP', 'STUDIOS', 'ENTERTAINMENT',
  'PUBLISHED', 'DEVELOPED', 'CAPCOM', 'UBISOFT', 'KONAMI', 'SQUARE', 'BANDAI',
  'ACTIVISION', 'BLIZZARD', 'BETHESDA', 'ROCKSTAR', 'WIFI', 'INTERNET',
]

function lineIsBlocked(line: string): boolean {
  const compact = line.toUpperCase().replace(/[^A-Z]/g, '')
  for (const phrase of STOP_SUBSTRINGS) {
    const target = phrase.replace(/[^A-Z]/g, '')
    if (target.length >= 5 && compact.includes(target)) return true
  }
  return false
}

function cleanLine(line: string): string {
  return line
    .replace(/[^\p{L}\p{N}\s:'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => !STOP_WORDS.has(w.toUpperCase()))
    .join(' ')
    .trim()
}

function letterRatio(s: string): number {
  if (!s.length) return 0
  let letters = 0
  for (const ch of s) if (/\p{L}/u.test(ch)) letters++
  return letters / s.length
}

function pickCandidates(lines: string[]): string[] {
  const cleaned = lines
    .filter(l => !lineIsBlocked(l))
    .map(cleanLine)
    .filter(l => l.length >= 3 && /\p{L}/u.test(l) && letterRatio(l) >= 0.5)

  const seen = new Set<string>()
  const unique = cleaned.filter(l => {
    const k = l.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const sorted = unique.sort((a, b) => b.length - a.length).slice(0, 6)
  const composites: string[] = []
  if (sorted.length >= 2) composites.push(`${sorted[0]} ${sorted[1]}`)
  if (sorted.length >= 3) composites.push(`${sorted[0]} ${sorted[1]} ${sorted[2]}`)

  return [...composites, ...sorted]
}

async function legacyOcrSearch(
  base64: string | undefined,
  imageUrl: string | undefined,
  mimeType: string,
  igdbH: Record<string, string>,
): Promise<IgdbGame | null> {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY')
  if (!apiKey) return null

  console.log('Using OCR.space legacy fallback')

  const [t2, t1] = await Promise.all([
    callOcrSpace(apiKey, '2', { base64, url: imageUrl, mimeType, language: 'eng' }).catch(() => ''),
    callOcrSpace(apiKey, '1', { base64, url: imageUrl, mimeType, language: 'eng' }).catch(() => ''),
  ])

  const combined = [t2, t1].filter(Boolean).join('\n')
  const lines = combined.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  console.log(`OCR.space lines: ${lines.length}`, lines.slice(0, 5))

  if (lines.length === 0) return null

  const candidates = pickCandidates(lines)
  console.log('OCR candidates:', candidates)

  const ocrCorpus = lines.join(' ')
  let bestMatch: { game: IgdbGame; score: number } | null = null

  // Try each candidate
  for (const candidate of candidates) {
    const results = await robustIgdbSearch(candidate, igdbH)
    if (!results.length) continue
    const ranked = rankResults(candidate, results)
    const top = ranked[0]
    if (!bestMatch || top.score > bestMatch.score) {
      bestMatch = { game: top.game, score: top.score }
    }
    if (top.score >= 0.7) break
  }

  // Franchise-aware fallback
  if (!bestMatch || bestMatch.score < 0.35) {
    const upper = ocrCorpus.toUpperCase()
    const franchise = KNOWN_FRANCHISES
      .sort((a, b) => b.length - a.length)
      .find(f => upper.includes(stripAccents(f).toUpperCase()))

    if (franchise) {
      console.log(`OCR franchise fallback: "${franchise}"`)
      const norm = stripAccents(franchise)
      const results = await searchIgdb(norm, { headers: igdbH, limit: 30, officialOnly: false })
      if (results.length > 0) {
        const scored = results
          .map(g => ({ game: g, score: overlapScore(ocrCorpus, g.name) }))
          .sort((a, b) => b.score - a.score)
        const top = scored[0]
        if (!bestMatch || top.score > bestMatch.score || top.score >= 0.20) {
          bestMatch = { game: top.game, score: top.score }
        }
      }
    }
  }

  if (!bestMatch || bestMatch.score < 0.20) return null
  return fixCoverUrl(bestMatch.game)
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody
    const { imageBase64, imageUrl, mimeType = 'image/jpeg' } = body

    if (!imageBase64 && !imageUrl) {
      return jsonResponse({ error: 'Se requiere imageBase64 o imageUrl' }, 400)
    }

    console.log('recognize-game-cover v2:', { hasBase64: !!imageBase64, hasUrl: !!imageUrl })

    const igdbH = await getIgdbHeaders()

    // ── Path 1: Gemini Flash Vision ───────────────────────────────────────────
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (geminiKey) {
      console.log('Trying Gemini Flash Vision...')
      const identification = await identifyWithGemini(imageBase64, imageUrl, mimeType)

      if (identification?.game_title) {
        console.log(`Gemini identified: "${identification.game_title}" (${identification.platform ?? 'unknown platform'}, confidence: ${identification.confidence})`)

        // Build list of titles to try (main title + alt titles)
        const titlesToTry = [
          identification.game_title,
          ...(identification.alt_titles ?? []),
        ].filter(Boolean)

        // Detect platform ID from Gemini's platform string
        const PLATFORM_MAP: Record<string, number> = {
          'NINTENDO SWITCH': 130, 'SWITCH': 130,
          'NINTENDO 3DS': 37, '3DS': 37, 'NINTENDO DS': 20,
          'WII U': 41, 'WII': 5,
          'PLAYSTATION 5': 167, 'PS5': 167,
          'PLAYSTATION 4': 48, 'PS4': 48,
          'PLAYSTATION 3': 9, 'PS3': 9,
          'XBOX SERIES': 169, 'XBOX ONE': 49, 'XBOX 360': 12,
          'VITA': 46, 'PSP': 38, 'PC': 6,
        }
        let platformId: number | null = null
        if (identification.platform) {
          const upperPlatform = identification.platform.toUpperCase()
          const key = Object.keys(PLATFORM_MAP)
            .sort((a, b) => b.length - a.length)
            .find(k => upperPlatform.includes(k))
          if (key) platformId = PLATFORM_MAP[key]
        }

        let bestGame: IgdbGame | null = null
        let bestScore = 0

        for (const title of titlesToTry) {
          const results = await robustIgdbSearch(title, igdbH, platformId)
          if (!results.length) continue
          const ranked = rankResults(title, results)
          const top = ranked[0]
          console.log(`  "${title}" → IGDB best: "${top.game.name}" (score: ${top.score.toFixed(2)})`)
          if (top.score > bestScore) {
            bestScore = top.score
            bestGame = top.game
          }
          if (top.score >= 0.6) break
        }

        // Accept Gemini result if IGDB found anything reasonable (score >= 0.2)
        // or if confidence is high (Gemini is quite reliable — trust it over score)
        const minScore = identification.confidence === 'high' ? 0.15 : 0.25
        if (bestGame && bestScore >= minScore) {
          console.log(`Gemini+IGDB success: "${bestGame.name}" (score: ${bestScore.toFixed(2)})`)
          return jsonResponse({
            ...fixCoverUrl(bestGame),
            _recognition: {
              provider: 'gemini',
              identified: identification.game_title,
              confidence: identification.confidence,
              matchScore: bestScore,
            },
          }, 200)
        }

        // Gemini found something but IGDB didn't match — try the raw title as a last resort
        if (identification.confidence === 'high' && titlesToTry.length > 0) {
          // Try fetchGameById if Gemini gave us a very specific title that might be an exact IGDB name
          const exactSearch = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST', headers: igdbH,
            body: `fields name, summary, cover.url, first_release_date, platforms, category, total_rating_count; where name ~ "${titlesToTry[0].replace(/"/g, '\\"')}"; limit 5;`,
          })
          if (exactSearch.ok) {
            const exactData: IgdbGame[] = await exactSearch.json()
            if (Array.isArray(exactData) && exactData.length > 0) {
              console.log(`Exact name match: "${exactData[0].name}"`)
              return jsonResponse({
                ...fixCoverUrl(exactData[0]),
                _recognition: { provider: 'gemini_exact', identified: identification.game_title, confidence: identification.confidence },
              }, 200)
            }
          }
        }

        console.warn(`Gemini identified "${identification.game_title}" but IGDB score too low (${bestScore.toFixed(2)}). Falling through to OCR fallback.`)
      } else {
        console.warn('Gemini returned null identification')
      }
    }

    // ── Path 2: OCR.space legacy fallback ────────────────────────────────────
    const game = await legacyOcrSearch(imageBase64, imageUrl, mimeType, igdbH)
    if (game) {
      console.log(`OCR.space success: "${game.name}"`)
      return jsonResponse({ ...game, _recognition: { provider: 'ocr_space' } }, 200)
    }

    // ── Nothing worked ────────────────────────────────────────────────────────
    return jsonResponse({
      error: 'No se pudo identificar el juego. Prueba a buscar manualmente por nombre.',
      _recognition: { provider: geminiKey ? 'gemini' : 'ocr_space', identified: null },
    }, 404)

  } catch (error: unknown) {
    const err = error as Error
    console.error('Unhandled error:', err.message)
    return jsonResponse({ error: err.message }, 500)
  }
})
