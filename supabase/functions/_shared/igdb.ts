/* ─────────────────────────────────────────────────────────────────────────────
 * Shared IGDB helpers for Edge Functions.
 * Used by: get-game-details, recognize-game-cover
 * ───────────────────────────────────────────────────────────────────────────── */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export interface IgdbGame {
  id: number
  name: string
  summary?: string
  cover?: { url?: string }
  first_release_date?: number
  platforms?: number[]
  category?: number
  total_rating_count?: number
}

export interface ScoredGame {
  game: IgdbGame
  score: number
}

const IGDB_FIELDS = 'fields name, summary, cover.url, first_release_date, platforms, category, total_rating_count'

// IGDB category values to ACCEPT — official releases only.
// 0=main_game, 8=remake, 9=remaster, 10=expanded, 11=port
// Excluded: 1=dlc, 2=expansion, 3=bundle, 5=mod, 6=episode, 12=fork
const OFFICIAL_CATEGORIES = '(0,8,9,10,11)'

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getIgdbHeaders(): Promise<Record<string, string>> {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID')
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Missing Twitch credentials')

  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return { 'Client-ID': clientId, Authorization: `Bearer ${cachedToken.value}` }
  }

  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  if (!tokenRes.ok) throw new Error(`Twitch Auth failed: ${tokenRes.statusText}`)

  const { access_token, expires_in } = await tokenRes.json()
  cachedToken = { value: access_token, expiresAt: now + (expires_in ?? 3600) * 1000 }

  return { 'Client-ID': clientId, Authorization: `Bearer ${access_token}` }
}

export function fixCoverUrl(game: IgdbGame): IgdbGame {
  if (game?.cover?.url) {
    game.cover.url = game.cover.url.startsWith('//') ? `https:${game.cover.url}` : game.cover.url
    game.cover.url = game.cover.url.replace('/t_thumb/', '/t_cover_big/')
  }
  return game
}

export async function fetchGameById(
  gameId: number | string,
  headers?: Record<string, string>,
): Promise<IgdbGame | null> {
  const h = headers ?? (await getIgdbHeaders())
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: h,
    body: `${IGDB_FIELDS}; where id = ${gameId};`,
  })
  if (!res.ok) return null
  const games = await res.json()
  return Array.isArray(games) && games.length > 0 ? fixCoverUrl(games[0]) : null
}

export async function searchIgdb(
  query: string,
  opts: {
    platformId?: number | null
    limit?: number
    headers?: Record<string, string>
    officialOnly?: boolean
  } = {},
): Promise<IgdbGame[]> {
  const { platformId = null, limit = 15, officialOnly = true } = opts
  const headers = opts.headers ?? (await getIgdbHeaders())
  const safeQuery = query.replace(/"/g, '\\"')

  // Combine filters into a single `where` clause when both apply
  const filters: string[] = []
  if (officialOnly) filters.push(`category = ${OFFICIAL_CATEGORIES}`)
  if (platformId) filters.push(`platforms = (${platformId})`)
  const whereClause = filters.length > 0 ? `where ${filters.join(' & ')};` : ''

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers,
    body: `search "${safeQuery}"; ${IGDB_FIELDS}; limit ${limit}; ${whereClause}`,
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function lookupByBarcode(
  barcode: string,
  headers?: Record<string, string>,
): Promise<{ gameId: number; uid: string } | null> {
  const h = headers ?? (await getIgdbHeaders())
  const variants = [...new Set([
    barcode,
    barcode.padStart(12, '0'),
    barcode.padStart(13, '0'),
    barcode.replace(/^0+/, ''),
  ])]

  for (const uid of variants) {
    const res = await fetch('https://api.igdb.com/v4/external_games', {
      method: 'POST',
      headers: h,
      body: `fields game; where uid = "${uid}"; limit 5;`,
    })
    if (!res.ok) continue
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { gameId: data[0].game, uid }
    }
  }
  return null
}

export function wordOverlapScore(source: string, candidate: string): number {
  const src = new Set(source.toLowerCase().split(/\s+/).filter(w => w.length > 1))
  const cnd = new Set(candidate.toLowerCase().split(/\s+/).filter(w => w.length > 1))
  if (src.size === 0) return 0
  let hits = 0
  for (const w of src) if (cnd.has(w)) hits++
  return hits / src.size
}

export function rankByTitle(query: string, games: IgdbGame[]): ScoredGame[] {
  return games
    .map(g => ({ game: g, score: wordOverlapScore(query, g.name) }))
    .sort((a, b) => b.score - a.score)
}

export function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
