import { serve } from "std/server"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Palabra overlap score (0-1): cuántas palabras del título limpio aparecen en el nombre del juego
function wordOverlapScore(source: string, candidate: string): number {
  const sourceWords = new Set(source.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  const candidateWords = new Set(candidate.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  if (sourceWords.size === 0) return 0;
  let matches = 0;
  for (const w of sourceWords) {
    if (candidateWords.has(w)) matches++;
  }
  return matches / sourceWords.size;
}

function fixCoverUrl(game: { cover?: { url?: string } } & Record<string, unknown>) {
  if (game?.cover?.url) {
    game.cover.url = game.cover.url.startsWith('//') ? `https:${game.cover.url}` : game.cover.url;
    // IGDB devuelve miniaturas, pedimos imagen grande
    game.cover.url = game.cover.url.replace('/t_thumb/', '/t_cover_big/');
  }
  return game;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}));
    const { barcode, igdbId, searchQuery } = body;
    console.log("Request body:", { barcode, igdbId, searchQuery });

    if (!barcode && !igdbId && !searchQuery) {
      throw new Error("Se requiere barcode, igdbId o searchQuery");
    }

    const clientID = Deno.env.get('TWITCH_CLIENT_ID') || 'xpjm7wkanku3gw6abbszfx2yss49kh'
    const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET') || '4xlk6u9pssvmvfzjibpgqiu8mcosof'

    if (!clientID || !clientSecret) {
      throw new Error("Server configuration error: Missing credentials");
    }

    // 1. Obtener Token de Twitch
    console.log("Fetching Twitch token...");
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientID}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    );

    if (!tokenRes.ok) {
      const errorMsg = await tokenRes.text();
      console.error("Twitch token fetch failed:", errorMsg);
      throw new Error(`Twitch Auth failed: ${tokenRes.statusText}`);
    }

    const { access_token } = await tokenRes.json();
    const igdbHeaders = { 'Client-ID': clientID, 'Authorization': `Bearer ${access_token}` };

    // Helper: fetch game details by IGDB numeric ID
    const fetchGameById = async (gameId: number | string) => {
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: igdbHeaders,
        body: `fields name, summary, cover.url, first_release_date; where id = ${gameId};`
      });
      if (!res.ok) return null;
      const games = await res.json();
      return Array.isArray(games) && games.length > 0 ? fixCoverUrl(games[0]) : null;
    };

    // ── MODE A: Direct IGDB ID lookup ─────────────────────────────────────
    if (igdbId) {
      console.log(`Direct IGDB ID lookup: ${igdbId}`);
      const game = await fetchGameById(igdbId);
      if (game) {
        console.log(`Found by IGDB ID: "${game.name}"`);
        return new Response(JSON.stringify(game), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }
      return new Response(
        JSON.stringify({ error: `No se encontró ningún juego con IGDB ID ${igdbId}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // ── MODE B: Text search on IGDB ───────────────────────────────────────
    if (searchQuery) {
      console.log(`Text search on IGDB: "${searchQuery}"`);
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: igdbHeaders,
        body: `search "${searchQuery}"; fields name, summary, cover.url, first_release_date; limit 10;`
      });
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const game = fixCoverUrl(results[0]);
          console.log(`Text search match: "${game.name}"`);
          return new Response(JSON.stringify(game), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          });
        }
      }
      return new Response(
        JSON.stringify({ error: `No se encontró "${searchQuery}" en IGDB` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // ── MODE C: Barcode scan ──────────────────────────────────────────────
    // Intentamos variantes: original, UPC-A (12 dígitos), EAN-13 (13 dígitos con 0 delante)
    const barcodesToTry = [...new Set([
      barcode,
      barcode.padStart(12, '0'),
      barcode.padStart(13, '0'),
      barcode.replace(/^0+/, ''), // strip leading zeros
    ])];

    let externalData: Record<string, unknown>[] = [];

    for (const b of barcodesToTry) {
      console.log(`Trying barcode variant: "${b}"`);
      const externalRes = await fetch('https://api.igdb.com/v4/external_games', {
        method: 'POST',
        headers: igdbHeaders,
        body: `fields game; where uid = "${b}"; limit 5;`
      });

      if (externalRes.ok) {
        const data = await externalRes.json();
        if (Array.isArray(data) && data.length > 0) {
          externalData = data;
          console.log(`Found game ID ${data[0].game} with variant: "${b}"`);
          break;
        }
      }
    }

    // 3. Si encontramos match directo, obtenemos detalles
    if (externalData.length > 0) {
      const gameId = externalData[0].game as string | number;
      const game = await fetchGameById(gameId);
      if (game) {
        console.log(`Direct barcode match: "${game.name}"`);
        return new Response(JSON.stringify(game), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }
    }

    // 4. FALLBACK: Consultar UPC Item DB para obtener el nombre
    console.log("No direct IGDB match. Trying UPC database fallback...");

    const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);

    if (!upcRes.ok) {
      console.warn(`UPC database returned ${upcRes.status}, skipping name fallback.`);
      return new Response(
        JSON.stringify({ error: 'No se pudo identificar el juego. Prueba a buscarlo por nombre manualmente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
 
    const upcData = await upcRes.json();

    if (upcData.code !== 'OK' || !upcData.items || upcData.items.length === 0) {
      console.log("UPC database found no items.");
      return new Response(
        JSON.stringify({ error: 'No se pudo identificar el juego. Prueba a buscarlo por nombre manualmente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log(`UPC database found ${upcData.items.length} candidate(s).`);

    const platformMap: Record<string, number> = {
      'NINTENDO SWITCH': 130, 'SWITCH': 130,
      'NINTENDO 3DS': 37, '3DS': 37,
      'NINTENDO DS': 20, ' DS ': 20,
      'WII U': 41, 'WIIU': 41,
      'WII': 5,
      'PLAYSTATION 5': 167, 'PS5': 167,
      'PLAYSTATION 4': 48, 'PS4': 48,
      'PLAYSTATION 3': 9, 'PS3': 9,
      'XBOX SERIES X': 169, 'XBOX SERIES S': 169, 'XBOX SERIES': 169,
      'XBOX ONE': 49, 'XBOX 360': 12,
      'VITA': 46, 'PSP': 38,
      'PC': 6,
    };

    const blacklist = [
      ...Object.keys(platformMap),
      'NINTENDO', 'SONY', 'MICROSOFT', 'SEGA', 'CAPCOM', 'UBISOFT', 'ELECTRONIC ARTS', 'EA',
      'EDITION', 'LIMITED', 'COLLECTOR', 'GOLD', 'PREMIUM', 'ULTIMATE', 'DELUXE', 'NUKETOWN',
      'PAL', 'NTSC', 'USA', 'EUR', 'EU', 'SELECTS', 'CLASSICS', 'HITS', 'PLATINUM', 'IMPORT',
      'COMPLETE', 'BUNDLE', 'PACK', 'GAME OF THE YEAR', 'GOTY',
    ];

    const searchIGDB = async (title: string, platformId: number | null): Promise<Record<string, unknown>[]> => {
      const platformFilter = platformId ? `where platforms = (${platformId});` : '';
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: igdbHeaders,
        body: `search "${title}"; fields name, summary, cover.url, first_release_date; limit 15; ${platformFilter}`
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    };

    // Intentamos hasta 5 candidatos del UPC DB
    for (const item of upcData.items.slice(0, 5)) {
      const rawTitle: string = item.title || '';
      console.log(`Processing UPC title: "${rawTitle}"`);

      // Detectar plataforma - iterar en orden de especificidad (más largo primero)
      let platformId: number | null = null;
      const upperTitle = rawTitle.toUpperCase();
      const sortedPlatformKeys = Object.keys(platformMap).sort((a, b) => b.length - a.length);
      for (const name of sortedPlatformKeys) {
        if (upperTitle.includes(name)) {
          platformId = platformMap[name];
          console.log(`Detected platform: "${name}" (ID: ${platformId})`);
          break;
        }
      }

      // Limpiar el título
      let queryTitle = rawTitle
        .replace(/[\(\[].*?(\)|\]|$)/g, '')  // quitar paréntesis/corchetes
        .replace(/[:\-\/&!¡?¿]/g, ' ')        // símbolos → espacio
        .replace(/\s+/g, ' ')
        .trim();

      // Quitar palabras de la blacklist (insensible a mayúsculas)
      // Ordenamos por longitud desc para evitar que "PS4" quite parte de "PS4 Pro"
      const sortedBlacklist = [...blacklist].sort((a, b) => b.length - a.length);
      for (const word of sortedBlacklist) {
        const reg = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        queryTitle = queryTitle.replace(reg, '');
      }

      queryTitle = queryTitle
        .replace(/\bEd\.?\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Eliminar palabras duplicadas preservando orden
      const seen = new Set<string>();
      queryTitle = queryTitle.split(' ').filter(w => {
        const lower = w.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      }).join(' ').trim();

      if (queryTitle.length < 3) {
        console.log(`Title too short after cleaning, skipping.`);
        continue;
      }

      console.log(`Searching IGDB for: "${queryTitle}"${platformId ? ` (platform ${platformId})` : ''}`);

      // Intento 1: con filtro de plataforma (si se detectó)
      let results = await searchIGDB(queryTitle, platformId);

      // Intento 2: sin filtro de plataforma (para juegos multiplataforma o detección fallida)
      if (results.length === 0 && platformId !== null) {
        console.log(`No results with platform filter. Retrying without platform...`);
        results = await searchIGDB(queryTitle, null);
      }

      // Intento 3: título más agresivo (solo palabras >2 chars)
      if (results.length === 0) {
        const aggressiveTitle = queryTitle.split(' ').filter(w => w.length > 2).join(' ');
        if (aggressiveTitle !== queryTitle && aggressiveTitle.length > 3) {
          console.log(`Retrying with aggressive clean: "${aggressiveTitle}"`);
          results = await searchIGDB(aggressiveTitle, platformId);
          if (results.length === 0 && platformId !== null) {
            results = await searchIGDB(aggressiveTitle, null);
          }
        }
      }

      if (results.length === 0) continue;

      // Elegir el mejor match por solapamiento de palabras
      const scored = results.map((g: any) => ({
        game: g,
        score: wordOverlapScore(queryTitle, g.name),
      }));

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      console.log(`Best match: "${best.game.name}" (score: ${best.score.toFixed(2)})`);

      // Umbral mínimo: al menos 25% de las palabras deben coincidir
      // (era 40% – demasiado estricto para títulos cortos como "Wii Sports Resort")
      if (best.score < 0.25 && scored.length > 1) {
        console.log(`Low confidence (${best.score.toFixed(2)}), trying next UPC candidate...`);
        continue;
      }

      const game = fixCoverUrl(best.game);
      return new Response(JSON.stringify(game), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    return new Response(
      JSON.stringify({ error: 'No se pudo identificar el juego. Prueba a buscarlo por nombre manualmente.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    );

  } catch (error: unknown) {
    const err = error as Error;
    console.error("Unhandled error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
})
