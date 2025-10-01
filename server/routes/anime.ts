import { RequestHandler } from "express";

// Primary providers
const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const ANIFY_BASE = "https://api.anify.tv";

// Simple in-memory cache with TTL
const TTL_MS = 5 * 60 * 1000;
const cache: Record<string, { at: number; data: any }> = {};
function getCached<T = any>(key: string): T | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.data as T;
}
function setCached(key: string, data: any) {
  cache[key] = { at: Date.now(), data };
}

function normalizeBaseTitle(title: string) {
  let s = String(title || "").trim();
  s = s.replace(/\s*-\s*(Season|Cour|Part)\s*\d+$/i, "");
  s = s.replace(/\s*\(\s*(Season|Cour|Part)\s*\d+\s*\)$/i, "");
  s = s.replace(/\s*\b(\d+)(st|nd|rd|th)\s+Season\b.*$/i, "");
  s = s.replace(/\s*\bSeason\s+\d+(?:\s*Part\s*\d+)?\b.*$/i, "");
  s = s.replace(/\s*\bFinal Season(?:\s*Part\s*\d+)?\b.*$/i, "");
  s = s.replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, "");
  s = s.replace(/\s+\d+$/i, "");
  return s.trim();
}

function seasonForDate(d = new Date()) {
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  if (month >= 1 && month <= 3) return { season: "WINTER", year } as const;
  if (month >= 4 && month <= 6) return { season: "SPRING", year } as const;
  if (month >= 7 && month <= 9) return { season: "SUMMER", year } as const;
  return { season: "FALL", year } as const;
}

async function gql<T = any>(query: string, variables: Record<string, any>) {
  const body = JSON.stringify({ query, variables });
  const key = `gql:${Buffer.from(query).toString("base64")}::${JSON.stringify(variables)}`;
  const cached = getCached<T>(key);
  if (cached) return cached;
  const r = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`AniList error: ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(`AniList error: ${JSON.stringify(j.errors)}`);
  setCached(key, j.data);
  return j.data as T;
}

function mapAnilistToSummary(m: any) {
  const title =
    m?.title?.userPreferred || m?.title?.english || m?.title?.romaji || m?.title?.native || "";
  const image = m?.coverImage?.extraLarge || m?.coverImage?.large || m?.coverImage?.medium || "";
  const baseTitle = normalizeBaseTitle(title);
  const type = m?.format || undefined;
  const year = m?.seasonYear ?? null;
  const rating = typeof m?.averageScore === "number" ? Math.round(m.averageScore) / 10 : null;
  return {
    id: m?.idMal || m?.id, // prefer MAL id to keep URLs stable, fallback to AniList id
    title: baseTitle,
    image,
    type,
    year,
    rating,
    subDub: "SUB",
    genres: Array.isArray(m?.genres) ? m.genres : [],
    synopsis: typeof m?.description === "string" ? m.description.replace(/<[^>]+>/g, "") : "",
  };
}

async function getAniIdsByMalOrAni(idRaw: string): Promise<{ id: number | null; idMal: number | null }> {
  const idNum = Number(idRaw);
  if (!Number.isFinite(idNum)) return { id: null, idMal: null };
  // Try by MAL id first
  const byMalQuery = `query($idMal: Int){ Media(idMal: $idMal, type: ANIME) { id idMal title { userPreferred } } }`;
  try {
    const mal = await gql<{ Media: any }>(byMalQuery, { idMal: idNum });
    if (mal?.Media) return { id: mal.Media.id, idMal: mal.Media.idMal };
  } catch {}
  // Fallback by AniList id
  const byIdQuery = `query($id: Int){ Media(id: $id, type: ANIME) { id idMal title { userPreferred } } }`;
  try {
    const ani = await gql<{ Media: any }>(byIdQuery, { id: idNum });
    if (ani?.Media) return { id: ani.Media.id, idMal: ani.Media.idMal };
  } catch {}
  return { id: null, idMal: null };
}

export const getTrending: RequestHandler = async (_req, res) => {
  try {
    const data = await gql<{ Page: { media: any[] } }>(
      `query($perPage:Int){
        Page(perPage:$perPage){
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false){
            id idMal title { userPreferred } coverImage{ extraLarge large medium }
            format seasonYear averageScore genres description
          }
        }
      }`,
      { perPage: 24 },
    );
    const results = (data?.Page?.media || [])
      .filter((m: any) => m?.idMal || m?.id)
      .map(mapAnilistToSummary);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch trending" });
  }
};

export const getSearch: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ results: [] });
    const data = await gql<{ Page: { media: any[] } }>(
      `query($q: String){
        Page(perPage: 20){
          media(search: $q, type: ANIME, isAdult: false, sort: POPULARITY_DESC){
            id idMal title { userPreferred } coverImage{ large medium }
            format seasonYear
          }
        }
      }`,
      { q },
    );
    const results = (data?.Page?.media || []).map((m: any) => ({
      mal_id: m.idMal || m.id,
      title: m?.title?.userPreferred,
      image_url: m?.coverImage?.medium || m?.coverImage?.large,
      type: m?.format,
      year: m?.seasonYear ?? null,
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Search failed" });
  }
};

async function fetchWithRelations(id: number) {
  const q = `query($id:Int!){
    Media(id:$id, type: ANIME){
      id idMal format title{ userPreferred }
      relations{ edges{ relationType node{ id idMal format title{ userPreferred } } } }
    }
  }`;
  const d = await gql<{ Media: any }>(q, { id });
  return d?.Media ?? null;
}

function pickEdge(edges: any[], type: "PREQUEL" | "SEQUEL") {
  const list = Array.isArray(edges) ? edges : [];
  const candidates = list.filter((e) => e?.relationType === type).map((e) => e.node);
  const tv = candidates.find((n: any) => n?.format === "TV" || n?.format === "ONA");
  return tv || candidates[0] || null;
}

export const getInfo: RequestHandler = async (req, res) => {
  try {
    const raw = String(req.params.id || "").trim();
    const ids = await getAniIdsByMalOrAni(raw);
    if (!ids.id && !ids.idMal) return res.status(404).json({ error: "Not found" });

    const data = await gql<{ Media: any }>(
      `query($id: Int, $idMal: Int){
        Media(id: $id, idMal: $idMal, type: ANIME){
          id idMal title { userPreferred english romaji native }
          coverImage{ extraLarge large medium }
          format seasonYear averageScore genres description
        }
      }`,
      { id: ids.id, idMal: ids.idMal },
    );

    const m = data?.Media;
    if (!m) return res.status(404).json({ error: "Not found" });
    const base = mapAnilistToSummary(m);

    // If movie, no seasons
    if (m.format === "MOVIE") return res.json({ ...base, seasons: [] });

    // Build seasons chain using PREQUEL/SEQUEL relations
    const start = await fetchWithRelations(m.id);
    if (!start) return res.json({ ...base, seasons: [] });

    const seen = new Set<number>([start.id]);
    const back: any[] = [];
    let node = start;
    for (let i = 0; i < 3; i++) {
      const prev = pickEdge(node.relations?.edges, "PREQUEL");
      if (!prev || seen.has(prev.id)) break;
      seen.add(prev.id);
      back.push(prev);
      node = await fetchWithRelations(prev.id);
      if (!node) break;
    }
    const chain = [...back.reverse(), start];

    node = start;
    for (let i = 0; i < 3; i++) {
      const next = pickEdge(node.relations?.edges, "SEQUEL");
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      chain.push(next);
      node = await fetchWithRelations(next.id);
      if (!node) break;
    }

    const seasons = chain
      .filter((n) => n && n.format !== "MOVIE")
      .map((n, idx) => ({
        id: n.idMal || n.id,
        number: idx + 1,
        title: normalizeBaseTitle(n?.title?.userPreferred || ""),
      }));

    return res.json({ ...base, seasons });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Info failed" });
  }
};

// helper fetch with timeout
async function fetchJson(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const getEpisodes: RequestHandler = async (req, res) => {
  try {
    const idRaw = String(req.params.id || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const perPage = 24;

    const ids = await getAniIdsByMalOrAni(idRaw);
    if (!ids.id) return res.json({ episodes: [], pagination: null });

    // Use Anify as authoritative episodes source
    const cacheKey = `anify:episodes:${ids.id}`;
    let data = getCached<any[]>(cacheKey);
    if (!data) {
      data = await fetchJson(`${ANIFY_BASE}/episodes/${ids.id}`);
      if (data) setCached(cacheKey, data);
    }
    if (!data) return res.json({ episodes: [], pagination: null });

    const providers: any[] = Array.isArray(data) ? data : [];
    const preferred = ["gogoanime", "zoro", "aniwatch", "animepahe", "9anime", "aniwave"];
    const sorted = providers.sort((a, b) => preferred.indexOf(a?.providerId) - preferred.indexOf(b?.providerId));

    const map: Map<number, { id: string; number: number; title?: string }> = new Map();
    for (const prov of sorted) {
      const eps = Array.isArray(prov?.episodes) ? prov.episodes : [];
      for (const ep of eps) {
        const num = typeof ep.number === "number" ? ep.number : Number(ep.number) || 0;
        if (!num || map.has(num)) continue;
        map.set(num, {
          id: String(ep.id ?? `${ids.id}-${num}`),
          number: num,
          title: ep.title || undefined,
        });
      }
    }

    const list = Array.from(map.values()).sort((a, b) => a.number - b.number);

    const total = list.length;
    const start = (page - 1) * perPage;
    const paged = list.slice(start, start + perPage);
    const pagination = {
      page,
      has_next_page: total > page * perPage,
      last_visible_page: Math.max(1, Math.ceil(total / perPage)),
      items: { count: Math.min(perPage, Math.max(0, total - start)), total, per_page: perPage },
    };

    return res.json({ episodes: paged, pagination });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Episodes failed" });
  }
};

export const getDiscover: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const order_by = String(req.query.order_by || "popularity").toLowerCase();
    const sortDir = String(req.query.sort || "desc").toLowerCase();
    const genre = String(req.query.genre || "").trim();

    const sortMap: Record<string, string> = {
      popularity: sortDir === "asc" ? "POPULARITY" : "POPULARITY_DESC",
      score: sortDir === "asc" ? "SCORE" : "SCORE_DESC",
      trending: sortDir === "asc" ? "TRENDING" : "TRENDING_DESC",
      updated: sortDir === "asc" ? "UPDATED_AT" : "UPDATED_AT_DESC",
      start_date: sortDir === "asc" ? "START_DATE" : "START_DATE_DESC",
    };
    const sort = sortMap[order_by] || (sortDir === "asc" ? "POPULARITY" : "POPULARITY_DESC");

    const variables: Record<string, any> = { page, perPage: 24, sort, q: q || null, genres: genre ? [genre] : null };

    const query = `query($page:Int,$perPage:Int,$q:String,$genres:[String],$sort:[MediaSort]){
      Page(page:$page, perPage:$perPage){
        pageInfo{ total perPage currentPage lastPage hasNextPage }
        media(
          search:$q,
          type: ANIME,
          isAdult:false,
          sort:$sort,
          genre_in: $genres
        ){
          id idMal title { userPreferred } coverImage{ large extraLarge }
          format seasonYear averageScore genres description
        }
      }
    }`;

    const data = await gql<{ Page: any }>(query, variables);
    const results = (data?.Page?.media || [])
      .filter((m: any) => m?.idMal || m?.id)
      .map(mapAnilistToSummary);
    const pi = data?.Page?.pageInfo || {};
    res.json({
      results,
      pagination: {
        page: pi.currentPage ?? page,
        has_next_page: !!pi.hasNextPage,
        last_visible_page: pi.lastPage ?? null,
        items: pi.total ? { count: results.length, total: pi.total, per_page: 24 } : null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Discover failed" });
  }
};

const CURATED_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Sci-Fi",
  "Slice of Life",
  "Mystery",
  "Romance",
  "Horror",
  "Supernatural",
  "Sports",
  "Mecha",
  "Music",
  "Psychological",
  "Thriller",
  "Isekai",
  "Historical",
  "Military",
  "School",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Josei",
];

export const getGenres: RequestHandler = async (_req, res) => {
  try {
    const genres = CURATED_GENRES.map((name, i) => ({ id: i + 1, name }));
    res.json({ genres });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch genres" });
  }
};

export const getStreaming: RequestHandler = async (req, res) => {
  try {
    const idRaw = String(req.params.id || "").trim();
    const epNum = Math.max(1, Number(req.query.ep || 1) || 1);
    const subType = String(req.query.sub || "sub");
    const ids = await getAniIdsByMalOrAni(idRaw);
    if (!ids.id) return res.json({ links: [] });

    const data = await fetchJson(`${ANIFY_BASE}/episodes/${ids.id}`);
    if (!data) return res.json({ links: [] });
    const providers: any[] = Array.isArray(data) ? data : [];
    const preferred = ["gogoanime", "zoro", "aniwatch", "animepahe", "9anime", "aniwave"];

    const links: { name: string; url: string }[] = [];

    for (const prov of providers.sort((a, b) => preferred.indexOf(a?.providerId) - preferred.indexOf(b?.providerId))) {
      const providerId = String(prov?.providerId || "");
      if (!providerId) continue;
      const eps = Array.isArray(prov?.episodes) ? prov.episodes : [];
      const match = eps.find((e: any) => (typeof e.number === "number" ? e.number : Number(e.number) || 0) === epNum);
      if (!match || !match.id) continue;

      const params = new URLSearchParams({
        providerId,
        watchId: String(match.id),
        episodeNumber: String(epNum),
        id: String(ids.id),
        subType,
      });
      const src = await fetchJson(`${ANIFY_BASE}/sources?${params.toString()}`, 10000);
      const srcArr = (src && (src.sources || src.data || src.stream)) || [];
      if (Array.isArray(srcArr)) {
        for (const s of srcArr) if (s?.url) links.push({ name: providerId, url: s.url });
      } else if (src?.url) {
        links.push({ name: providerId, url: src.url });
      }

      if (links.length > 0) break;
    }

    res.json({ links });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Streaming providers failed" });
  }
};

export const getNewReleases: RequestHandler = async (_req, res) => {
  try {
    const { season, year } = seasonForDate();
    const data = await gql<{ Page: { media: any[] } }>(
      `query($season: MediaSeason!, $seasonYear: Int!){
        Page(perPage: 24){
          media(type: ANIME, season: $season, seasonYear: $seasonYear, isAdult:false, sort: POPULARITY_DESC){
            id idMal title { userPreferred } coverImage{ extraLarge large medium }
            format seasonYear averageScore genres description
          }
        }
      }`,
      { season, seasonYear: year },
    );
    const results = (data?.Page?.media || [])
      .filter((m: any) => m?.idMal || m?.id)
      .map(mapAnilistToSummary);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch new releases" });
  }
};
