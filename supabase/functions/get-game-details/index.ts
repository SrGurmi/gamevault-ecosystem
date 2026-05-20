import { serve } from "std/server"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── IGDB official categories to accept ──────────────────────────────────────
// 0=main_game, 8=remake, 9=remaster, 10=expanded_game, 11=port
// Excluded: 1=dlc, 2=expansion, 3=bundle, 5=mod, 6=episode, 12=fork (ROM hacks)
const OFFICIAL_CATEGORIES = '(0,8,9,10,11)'

// Fields we always request from IGDB (cover_big instead of thumb)
const IGDB_FIELDS = 'fields name, summary, cover.url, first_release_date, platforms, category, total_rating_count'

// Platform name → IGDB platform ID mapping (sorted by key length descending at runtime)
const PLATFORM_MAP: Record<string, number> = {
  'NINTENDO SWITCH': 130, 'SWITCH': 130,
  'NINTENDO 3DS': 37,     '3DS': 37,
  'NINTENDO DS': 20,
  'WII U': 41,            'WIIU': 41,
  'WII': 5,
  'PLAYSTATION 5': 167,   'PS5': 167,
  'PLAYSTATION 4': 48,    'PS4': 48,
  'PLAYSTATION 3': 9,     'PS3': 9,
  'XBOX SERIES X': 169,   'XBOX SERIES S': 169, 'XBOX SERIES': 169,
  'XBOX ONE': 49,          'XBOX 360': 12,
  'VITA': 46,              'PSP': 38,
  'PC': 6,
}

// Words to strip from UPC product titles before searching IGDB
const TITLE_BLACKLIST = [
  ...Object.keys(PLATFORM_MAP),
  'NINTENDO', 'SONY', 'MICROSOFT', 'SEGA', 'CAPCOM', 'UBISOFT', 'ELECTRONIC ARTS', 'EA',
  'ACTIVISION', 'BLIZZARD', 'BANDAI', 'NAMCO', 'KONAMI', 'BETHESDA', 'ROCKSTAR', 'ATARI',
  'EDITION', 'LIMITED', 'COLLECTOR', 'GOLD', 'PREMIUM', 'ULTIMATE', 'DELUXE',
  'PAL', 'NTSC', 'USA', 'EUR', 'EU', 'UK', 'SELECTS', 'CLASSICS', 'HITS', 'PLATINUM',
  'IMPORT', 'COMPLETE', 'BUNDLE', 'PACK', 'GAME OF THE YEAR', 'GOTY',
  'GAME ONLY', 'ONLY', 'BOX', 'BOXED', 'SEALED', 'NEW', 'USED', 'REFURBISHED',
  'NUKETOWN', 'BONUS', 'CONTENT', 'SEASON PASS', 'DLC',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixCoverUrl(game: Record<string, unknown>) {
  const cover = game.cover as { url?: string } | undefined
  if (cover?.url) {
    cover.url = cover.url.startsWith('//') ? `https:${cover.url}` : cover.url
    cover.url = cover.url.replace('/t_thumb/', '/t_cover_big/')
  }
  return game
}

/**
 * Digit-aware word-overlap score.
 *
 * Rules:
 * - Numeric tokens (year, sequel numbers, etc.) in the SOURCE must appear in
 *   the CANDIDATE to avoid confusing "FIFA 23" with "FIFA 24".
 * - If a numeric token from SOURCE is absent in CANDIDATE the whole score is
 *   penalised by 0.3 per missing digit-word (clamped to 0).
 * - Non-numeric scoring is the classic word-overlap ratio.
 */
function smartScore(source: string, candidate: string): number {
  const tokenize = (s: string) =>
    s.toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 0)

  const srcTokens = tokenize(source)
  const cndSet = new Set(tokenize(candidate))

  if (srcTokens.length === 0) return 0

  const isNumeric = (w: string) => /^\d+$/.test(w)

  let wordHits = 0
  let wordTotal = 0
  let numericPenalty = 0

  for (const w of srcTokens) {
    if (w.length <= 1) continue // skip single chars
    if (isNumeric(w)) {
      // Numeric token: must match exactly. Missing = penalty.
      if (!cndSet.has(w)) numericPenalty += 0.3
    } else {
      wordTotal++
      if (cndSet.has(w)) wordHits++
    }
  }

  const overlapScore = wordTotal > 0 ? wordHits / wordTotal : 1
  return Math.max(0, overlapScore - numericPenalty)
}

/** Pick the best from a list of IGDB results given a query title. */
function rankResults(query: string, results: Record<string, unknown>[]) {
  return results
    .map(g => ({ game: g, score: smartScore(query, g.name as string) }))
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.05) {
        const popA = (a.game.total_rating_count as number) ?? 0
        const popB = (b.game.total_rating_count as number) ?? 0
        return popB - popA
      }
      return b.score - a.score
    })
}

/** Remove diacritics/accents so "Pokémon" → "Pokemon" for IGDB search. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── IGDB API wrappers ────────────────────────────────────────────────────────

async function getIgdbHeaders(clientId: string, clientSecret: string) {
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  if (!tokenRes.ok) throw new Error(`Twitch Auth failed: ${tokenRes.statusText}`)
  const { access_token } = await tokenRes.json()
  return { 'Client-ID': clientId, 'Authorization': `Bearer ${access_token}` }
}

async function fetchGameById(
  gameId: number | string,
  igdbHeaders: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: igdbHeaders,
    body: `${IGDB_FIELDS}; where id = ${gameId};`,
  })
  if (!res.ok) return null
  const games = await res.json()
  return Array.isArray(games) && games.length > 0 ? fixCoverUrl(games[0]) : null
}

async function searchIGDB(
  title: string,
  platformId: number | null,
  igdbHeaders: Record<string, string>,
  limit = 15,
): Promise<Record<string, unknown>[]> {
  const filters: string[] = [`category = ${OFFICIAL_CATEGORIES}`]
  if (platformId) filters.push(`platforms = (${platformId})`)
  const whereClause = `where ${filters.join(' & ')};`
  const safe = title.replace(/"/g, '\\"')
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: igdbHeaders,
    body: `search "${safe}"; ${IGDB_FIELDS}; limit ${limit}; ${whereClause}`,
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/**
 * Barcode → IGDB game via external_games endpoint.
 * Tries multiple uid variants (leading-zero padding / stripping).
 * Returns first matching game ID.
 */
async function barcodeToIgdbGame(
  barcode: string,
  igdbHeaders: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const variants = [...new Set([
    barcode,
    barcode.padStart(12, '0'),
    barcode.padStart(13, '0'),
    barcode.replace(/^0+/, ''),
  ])]

  for (const uid of variants) {
    console.log(`Trying IGDB external_games uid: "${uid}"`)
    // No category filter — IGDB doesn't consistently tag physical barcodes
    const res = await fetch('https://api.igdb.com/v4/external_games', {
      method: 'POST',
      headers: igdbHeaders,
      body: `fields game, uid; where uid = "${uid}"; limit 10;`,
    })
    if (!res.ok) continue
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const gameId = data[0].game
      console.log(`IGDB external_games hit: game ${gameId} (uid "${uid}")`)
      return await fetchGameById(gameId, igdbHeaders)
    }
  }
  return null
}

/**
 * Clean a raw UPC product title into a searchable IGDB query string.
 * Returns null if the cleaned title is too short to be useful.
 */
function cleanUpcTitle(rawTitle: string): { queryTitle: string; platformId: number | null } | null {
  const upperTitle = rawTitle.toUpperCase()

  // Detect platform from title
  let platformId: number | null = null
  const sortedKeys = Object.keys(PLATFORM_MAP).sort((a, b) => b.length - a.length)
  for (const name of sortedKeys) {
    if (upperTitle.includes(name)) {
      platformId = PLATFORM_MAP[name]
      console.log(`Detected platform: "${name}" (ID: ${platformId})`)
      break
    }
  }

  // Strip parenthetical / bracketed content
  let queryTitle = rawTitle
    .replace(/[\(\[].*?(\)|\]|$)/g, '')
    .replace(/[:\-\/&!¡?¿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip blacklisted words (longest first to avoid partial matches)
  const sortedBlacklist = [...TITLE_BLACKLIST].sort((a, b) => b.length - a.length)
  for (const word of sortedBlacklist) {
    const reg = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    queryTitle = queryTitle.replace(reg, '')
  }

  // Strip edition suffixes like "Ed." / "Ed" not caught above
  queryTitle = queryTitle
    .replace(/\bEd\.?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Deduplicate consecutive repeated words
  const seen = new Set<string>()
  queryTitle = queryTitle.split(' ').filter(w => {
    const lower = w.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  }).join(' ').trim()

  if (queryTitle.length < 3) {
    console.log(`Title "${rawTitle}" → too short after cleaning, skipping.`)
    return null
  }

  return { queryTitle, platformId }
}

/**
 * Multi-attempt IGDB text search for a given cleaned title.
 * Tries: with platform → without platform → aggressive clean → no category filter → accent-stripped.
 */
async function searchWithFallbacks(
  queryTitle: string,
  platformId: number | null,
  igdbHeaders: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const safe = (t: string) => t.replace(/"/g, '\\"')

  // Attempt 1: with platform filter + category filter
  let results = await searchIGDB(queryTitle, platformId, igdbHeaders)

  // Attempt 2: without platform, keep category filter
  if (results.length === 0 && platformId !== null) {
    console.log(`No platform results. Retrying without platform...`)
    results = await searchIGDB(queryTitle, null, igdbHeaders)
  }

  // Attempt 3: aggressive clean (words > 2 chars)
  if (results.length === 0) {
    const aggressive = queryTitle.split(' ').filter(w => w.length > 2).join(' ')
    if (aggressive !== queryTitle && aggressive.length > 3) {
      console.log(`Aggressive retry: "${aggressive}"`)
      results = await searchIGDB(aggressive, platformId, igdbHeaders)
      if (results.length === 0 && platformId !== null) {
        results = await searchIGDB(aggressive, null, igdbHeaders)
      }
    }
  }

  // Attempt 4: bare search with NO category filter (most permissive)
  // IGDB search + where category can sometimes return 0 when the game exists
  if (results.length === 0) {
    console.log(`No category-filtered results. Trying bare search for "${queryTitle}"...`)
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: igdbHeaders,
      body: `search "${safe(queryTitle)}"; ${IGDB_FIELDS}; limit 15;`,
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) results = data
    }
  }

  // Attempt 5: strip accents from title (e.g. "Pokémon" → "Pokemon") + bare search
  const stripped = stripAccents(queryTitle)
  if (results.length === 0 && stripped !== queryTitle) {
    console.log(`Accent-stripped retry: "${stripped}"`)
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: igdbHeaders,
      body: `search "${safe(stripped)}"; ${IGDB_FIELDS}; limit 15;`,
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) results = data
    }
  }

  return results
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const { barcode, igdbId, searchQuery } = body
    console.log('Request body:', { barcode, igdbId, searchQuery })

    if (!barcode && !igdbId && !searchQuery) {
      throw new Error('Se requiere barcode, igdbId o searchQuery')
    }

    const clientId = Deno.env.get('TWITCH_CLIENT_ID')
    const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('Missing Twitch credentials')

    const igdbHeaders = await getIgdbHeaders(clientId, clientSecret)

    // ── MODE A: direct IGDB ID ───────────────────────────────────────────────
    if (igdbId) {
      console.log(`Direct IGDB ID lookup: ${igdbId}`)
      const game = await fetchGameById(igdbId, igdbHeaders)
      if (game) {
        console.log(`Found by IGDB ID: "${game.name}"`)
        return new Response(JSON.stringify(game), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      return new Response(
        JSON.stringify({ error: `No se encontró ningún juego con IGDB ID ${igdbId}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      )
    }

    // ── MODE B: manual text search ────────────────────────────────────────────
    if (searchQuery) {
      console.log(`Text search on IGDB: "${searchQuery}"`)
      // Use category filter + proper ranking instead of blindly picking results[0]
      const results = await searchIGDB(searchQuery, null, igdbHeaders, 20)

      if (results.length > 0) {
        const ranked = rankResults(searchQuery, results)
        const best = ranked[0]
        console.log(`Text search best: "${best.game.name}" (score: ${best.score.toFixed(2)})`)
        return new Response(JSON.stringify(fixCoverUrl(best.game)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      // Try without category filter as last resort
      const safe = searchQuery.replace(/"/g, '\\"')
      const fallbackRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: igdbHeaders,
        body: `search "${safe}"; ${IGDB_FIELDS}; limit 10;`,
      })
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json()
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          const ranked = rankResults(searchQuery, fallbackData)
          const best = ranked[0]
          console.log(`Fallback text search: "${best.game.name}" (score: ${best.score.toFixed(2)})`)
          return new Response(JSON.stringify(fixCoverUrl(best.game)), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          })
        }
      }

      return new Response(
        JSON.stringify({ error: `No se encontró "${searchQuery}" en IGDB` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      )
    }

    // ── MODE C: barcode lookup ────────────────────────────────────────────────

    // Step 1: Direct IGDB barcode lookup (most accurate path)
    const directMatch = await barcodeToIgdbGame(barcode, igdbHeaders)
    if (directMatch) {
      console.log(`Direct barcode match: "${directMatch.name}"`)
      return new Response(JSON.stringify(directMatch), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Step 2: UPC database fallback — resolve barcode → product title → IGDB search
    console.log('No direct IGDB barcode match. Trying UPC database...')

    // Try primary UPC source (upcitemdb — free trial, ~100 req/day)
    let upcItems: Array<{ title: string }> = []

    const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      headers: { 'Accept': 'application/json' },
    }).catch(() => null)

    if (upcRes?.ok) {
      const upcData = await upcRes.json().catch(() => null)
      if (upcData?.code === 'OK' && Array.isArray(upcData.items) && upcData.items.length > 0) {
        upcItems = upcData.items
        console.log(`UPC database: ${upcItems.length} candidate(s) from upcitemdb`)
      }
    }

    // Try secondary UPC source: Open Food Facts (covers physical games sold in grocery/retail chains)
    // This is a free, unlimited API with a huge barcode DB
    if (upcItems.length === 0) {
      console.log('upcitemdb found nothing. Trying Open Food Facts...')
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands`, {
        headers: { 'Accept': 'application/json' },
      }).catch(() => null)

      if (offRes?.ok) {
        const offData = await offRes.json().catch(() => null)
        if (offData?.status === 1 && offData.product?.product_name) {
          upcItems = [{ title: offData.product.product_name }]
          console.log(`Open Food Facts hit: "${offData.product.product_name}"`)
        }
      }
    }

    if (upcItems.length === 0) {
      console.log('All UPC sources exhausted.')
      return new Response(
        JSON.stringify({ error: 'No se pudo identificar el juego. Prueba a buscarlo por nombre manualmente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      )
    }

    // Step 3: For each UPC title, clean it and search IGDB
    for (const item of upcItems.slice(0, 5)) {
      const rawTitle: string = item.title || ''
      console.log(`Processing UPC title: "${rawTitle}"`)

      const cleaned = cleanUpcTitle(rawTitle)
      if (!cleaned) continue

      const { queryTitle, platformId } = cleaned
      console.log(`Searching IGDB for: "${queryTitle}"${platformId ? ` (platform ${platformId})` : ''}`)

      const results = await searchWithFallbacks(queryTitle, platformId, igdbHeaders)
      if (results.length === 0) {
        console.log(`No IGDB results for "${queryTitle}"`)
        continue
      }

      const ranked = rankResults(queryTitle, results)
      const best = ranked[0]

      console.log(`Best match: "${best.game.name}" (score: ${best.score.toFixed(2)}, ratings: ${(best.game.total_rating_count as number) ?? 0})`)

      // Accept if:
      // - score >= 0.25 regardless of number of results, OR
      // - only 1 result came back and score >= 0.10 (IGDB search already filtered by title similarity)
      const minScore = results.length === 1 ? 0.10 : 0.25
      if (best.score < minScore) {
        console.log(`Score ${best.score.toFixed(2)} below threshold ${minScore}. Trying next UPC candidate...`)
        continue
      }

      return new Response(JSON.stringify(fixCoverUrl(best.game)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(
      JSON.stringify({ error: 'No se pudo identificar el juego. Prueba a buscarlo por nombre manualmente.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
    )

  } catch (error: unknown) {
    const err = error as Error
    console.error('Unhandled error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
