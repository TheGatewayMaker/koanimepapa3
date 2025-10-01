import { RequestHandler } from "express";
import { safeFetch } from "../utils/safe-fetch";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANIMEDEX_BASE = "https://api3.anime-dexter-live.workers.dev";
const ANILIST_GQL = "https://graphql.anilist.co";

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

async function fetchJson(url: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await safeFetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDex(path: string, timeoutMs = 12000) {
  const url = `${ANIMEDEX_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await safeFetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gql<T>(
  query: string,
  variables: Record<string, any>,
  timeoutMs = 12000,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await safeFetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.errors) return null;
    return j?.data as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapJikanAnimeToSummary(a: any) {
  const id = a?.mal_id ?? a?.id ?? null;
  const title =
    a?.title_english ||
    a?.title ||
    (Array.isArray(a?.titles) ? a.titles[0]?.title : "") ||
    "";
  const image =
    a?.images?.jpg?.large_image_url ||
    a?.images?.jpg?.image_url ||
    a?.image_url ||
    "";
  const type = a?.type || undefined;
  const year =
    a?.year ??
    (a?.aired?.from ? new Date(a.aired.from).getUTCFullYear() : null);
  const rating = typeof a?.score === "number" ? a.score : null;
  const synopsis = typeof a?.synopsis === "string" ? a.synopsis : "";
  const genres = Array.isArray(a?.genres)
    ? a.genres.map((g: any) => g?.name).filter(Boolean)
    : [];
  return { id, title, image, type, year, rating, synopsis, genres };
}

function mapDexAnimeToSummary(a: any) {
  // Best-effort tolerant mapper for AnimeDex responses
  const id =
    a?.id ?? a?.animeId ?? a?.mal_id ?? a?.slug ?? a?.gogo_id ?? a?.animeIdV2;
  const title = a?.title ?? a?.name ?? a?.animeTitle ?? a?.title_english ?? "";
  const image =
    a?.image ??
    a?.img ??
    a?.poster ??
    a?.cover ??
    a?.picture ??
    a?.thumbnail ??
    "";
  const type = a?.type ?? a?.format ?? undefined;
  const yearRaw =
    a?.year ?? a?.releaseDate ?? a?.released ?? a?.airedFrom ?? null;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number((yearRaw.match(/\d{4}/) || [])[0]) || null
        : null;
  const ratingRaw = a?.rating ?? a?.score ?? a?.averageScore ?? null;
  const rating =
    typeof ratingRaw === "number"
      ? ratingRaw
      : typeof ratingRaw === "string"
        ? Number(ratingRaw)
        : null;
  const synopsis = (
    a?.synopsis ||
    a?.description ||
    a?.overview ||
    a?.plot ||
    ""
  ).toString();
  const genres = Array.isArray(a?.genres)
    ? a.genres
        .map((g: any) => (typeof g === "string" ? g : g?.name))
        .filter(Boolean)
    : [];
  return { id, title, image, type, year, rating, synopsis, genres };
}

// Genres mapping cache (name -> id)
let genreMapCache: { at: number; byName: Record<string, number> } | null = null;
async function getGenreIdByName(name: string): Promise<number | null> {
  if (!name) return null;
  const now = Date.now();
  if (!genreMapCache || now - genreMapCache.at > TTL_MS) {
    const j = await fetchJson(`${JIKAN_BASE}/genres/anime`, 12000);
    const list: any[] = (j?.data as any[]) || [];
    const byName: Record<string, number> = {};
    for (const g of list) {
      const nm = String(g?.name || "").toLowerCase();
      if (nm) byName[nm] = g?.mal_id;
    }
    genreMapCache = { at: now, byName };
  }
  const id = genreMapCache.byName[name.toLowerCase()] ?? null;
  return typeof id === "number" ? id : null;
}

export const getTrending: RequestHandler = async (_req, res) => {
  try {
    const key = `jikan:top:anime:24`;
    let j = getCached<any>(key);
    if (!j) {
      j = await fetchJson(`${JIKAN_BASE}/top/anime?limit=24&sfw`, 12000);
      if (j) setCached(key, j);
    }
    let results = ((j?.data as any[]) || []).map(mapJikanAnimeToSummary);

    if (!results.length) {
      const dj = await fetchDex("/gogoPopular/1");
      const arr: any[] = Array.isArray(dj)
        ? dj
        : dj?.results || dj?.data || dj?.items || dj?.animes || [];
      results = arr.map(mapDexAnimeToSummary).slice(0, 24);
    }

    res.json({ results });
  } catch (e: any) {
    // Final fallback attempt
    const dj = await fetchDex("/gogoPopular/1");
    const arr: any[] = Array.isArray(dj)
      ? dj
      : dj?.results || dj?.data || dj?.items || dj?.animes || [];
    const results = arr.map(mapDexAnimeToSummary).slice(0, 24);
    if (results.length) return res.json({ results });
    res.status(500).json({ error: e?.message || "Failed to fetch trending" });
  }
};

export const getSearch: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ results: [] });

    const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(q)}&limit=30&sfw&order_by=members&sort=desc`;
    const j = await fetchJson(url, 12000);
    const raw: any[] = (j?.data as any[]) || [];

    const norm = (s: string) => s.toLowerCase();
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    function score(item: any): number {
      const titles: string[] = [];
      if (item?.title) titles.push(item.title);
      if (item?.title_english) titles.push(item.title_english);
      if (Array.isArray(item?.titles))
        titles.push(...item.titles.map((t: any) => t?.title).filter(Boolean));
      const hay = norm(titles.join(" | "));
      let s = 0;
      for (const t of tokens) {
        if (!t) continue;
        if (hay.includes(t)) s += 5;
        if (hay.startsWith(t)) s += 2;
      }
      if (typeof item?.members === "number")
        s += Math.min(10, Math.floor(item.members / 100000));
      if (typeof item?.favorites === "number")
        s += Math.min(10, Math.floor(item.favorites / 10000));
      return s;
    }

    let ranked = raw
      .map((a) => ({ a, s: score(a) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 20)
      .map(({ a }) => ({
        mal_id: a?.mal_id,
        title: a?.title_english || a?.title,
        image_url: a?.images?.jpg?.image_url,
        type: a?.type,
        year: a?.year ?? null,
      }));

    if (!ranked.length) {
      const dj = await fetchDex(`/search/${encodeURIComponent(q)}`);
      const arr: any[] = Array.isArray(dj)
        ? dj
        : dj?.results || dj?.data || dj?.items || dj?.animes || [];
      ranked = arr.slice(0, 20).map((a: any) => ({
        mal_id: a?.mal_id ?? a?.id ?? a?.animeId ?? null,
        title: a?.title ?? a?.name ?? a?.animeTitle ?? "",
        image_url: a?.image ?? a?.img ?? a?.poster ?? "",
        type: a?.type ?? a?.format ?? undefined,
        year:
          typeof a?.year === "number"
            ? a.year
            : typeof a?.releaseDate === "string"
              ? Number((a.releaseDate.match(/\d{4}/) || [])[0]) || null
              : null,
      }));
    }

    res.json({ results: ranked });
  } catch (e: any) {
    // Fallback
    const q = String(req.query.q || "").trim();
    const dj = q ? await fetchDex(`/search/${encodeURIComponent(q)}`) : null;
    const arr: any[] = Array.isArray(dj)
      ? dj
      : dj?.results || dj?.data || dj?.items || dj?.animes || [];
    const ranked = arr.slice(0, 20).map((a: any) => ({
      mal_id: a?.mal_id ?? a?.id ?? a?.animeId ?? null,
      title: a?.title ?? a?.name ?? a?.animeTitle ?? "",
      image_url: a?.image ?? a?.img ?? a?.poster ?? "",
      type: a?.type ?? a?.format ?? undefined,
      year:
        typeof a?.year === "number"
          ? a.year
          : typeof a?.releaseDate === "string"
            ? Number((a.releaseDate.match(/\d{4}/) || [])[0]) || null
            : null,
    }));
    if (ranked.length) return res.json({ results: ranked });
    res.status(500).json({ error: e?.message || "Search failed" });
  }
};

export const getInfo: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "Invalid id" });

    const j = await fetchJson(`${JIKAN_BASE}/anime/${id}/full`, 12000);
    const a = j?.data;
    if (!a) {
      // Try AniList by MAL id
      const al = await gql<any>(
        `query($idMal:Int!){ Media(idMal:$idMal, type:ANIME){ id title{ romaji english native } coverImage{ large extraLarge } seasonYear averageScore format genres description(asHtml:false) } }`,
        { idMal: Number(id) },
      );
      const m = al?.Media;
      if (m) {
        const title = (
          m?.title?.english ||
          m?.title?.romaji ||
          m?.title?.native ||
          ""
        ).toString();
        const info = {
          ...mapDexAnimeToSummary({
            id: Number(id),
            title,
            image: m?.coverImage?.extraLarge || m?.coverImage?.large || "",
            year: m?.seasonYear ?? null,
            rating:
              typeof m?.averageScore === "number"
                ? Math.round(m.averageScore / 10)
                : null,
            format: m?.format,
            genres: m?.genres || [],
            description: (m?.description || "").toString(),
          }),
          seasons: [] as any[],
        };
        return res.json(info);
      }
      // Try AnimeDex search by title obtained from AniList (if any failed above then no info)
      return res.status(404).json({ error: "Not found" });
    }

    let base = mapJikanAnimeToSummary(a);

    // Prefer AniList extraLarge cover image when available for higher quality banner use
    try {
      const al = await gql<any>(
        `query($idMal:Int!){ Media(idMal:$idMal, type:ANIME){ coverImage{ extraLarge large } } }`,
        { idMal: Number(id) },
      );
      const alImg =
        al?.Media?.coverImage?.extraLarge || al?.Media?.coverImage?.large || "";
      if (alImg) base = { ...base, image: alImg };
    } catch {
      // ignore optional enrichment errors
    }

    // Build seasons chain using relations (prequel/sequel). Limit depth for perf.
    const seen = new Set<number>([Number(id)]);
    const back: any[] = [];
    const fwd: any[] = [];

    async function getFull(malId: number) {
      const key = `jikan:full:${malId}`;
      let data = getCached<any>(key);
      if (!data) {
        data = await fetchJson(`${JIKAN_BASE}/anime/${malId}/full`, 12000);
        if (data) setCached(key, data);
      }
      return data?.data || null;
    }

    function pick(rel: any[], type: string) {
      const list = Array.isArray(rel) ? rel : [];
      const nodes = list
        .filter((r: any) => (r?.relation || "").toLowerCase() === type)
        .flatMap((r: any) => (Array.isArray(r?.entry) ? r.entry : []));
      const tv = nodes.find((n: any) => n?.type === "TV" || n?.type === "ONA");
      return tv || nodes[0] || null;
    }

    let cur = a;
    for (let i = 0; i < 3; i++) {
      const prev = pick(cur?.relations, "prequel");
      const mal = prev?.mal_id;
      if (!mal || seen.has(mal)) break;
      seen.add(mal);
      const full = await getFull(mal);
      if (!full) break;
      back.push(full);
      cur = full;
    }

    cur = a;
    for (let i = 0; i < 3; i++) {
      const next = pick(cur?.relations, "sequel");
      const mal = next?.mal_id;
      if (!mal || seen.has(mal)) break;
      seen.add(mal);
      const full = await getFull(mal);
      if (!full) break;
      fwd.push(full);
      cur = full;
    }

    const chain = [...back.reverse(), a, ...fwd];
    const seasons = chain
      .filter((n) => n && n.type !== "Movie")
      .map((n, idx) => ({
        id: n.mal_id,
        number: idx + 1,
        title: n?.title_english || n?.title,
      }));

    res.json({ ...base, seasons });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Info failed" });
  }
};

export const getEpisodes: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    if (!/^\d+$/.test(id)) return res.json({ episodes: [], pagination: null });
    const j = await fetchJson(
      `${JIKAN_BASE}/anime/${id}/episodes?page=${page}`,
      12000,
    );
    const items: any[] = (j?.data as any[]) || [];
    let episodes = items.map((ep: any, idx: number) => ({
      id: String(ep?.mal_id ?? `${id}-${(page - 1) * 100 + idx + 1}`),
      number:
        typeof ep?.mal_id === "number"
          ? ep.mal_id
          : (ep?.episode ?? ep?.number ?? idx + 1),
      title: ep?.title || ep?.title_romanji || ep?.title_ja || undefined,
      air_date: ep?.aired || null,
    }));
    const pagination = j?.pagination || null;
    const last = pagination?.last_visible_page ?? pagination?.last_page ?? null;

    if (!episodes.length) {
      // Fallback path: get title via AniList idMal, then use AnimeDex search -> anime -> episodes
      const al = await gql<any>(
        `query($idMal:Int!){ Media(idMal:$idMal, type:ANIME){ id title{ romaji english native } } }`,
        { idMal: Number(id) },
      );
      const title =
        al?.Media?.title?.english ||
        al?.Media?.title?.romaji ||
        al?.Media?.title?.native ||
        "";
      if (title) {
        const djSearch = await fetchDex(`/search/${encodeURIComponent(title)}`);
        const arr: any[] = Array.isArray(djSearch)
          ? djSearch
          : djSearch?.results ||
            djSearch?.data ||
            djSearch?.items ||
            djSearch?.animes ||
            [];
        const cand = arr[0];
        const dexId = cand?.id ?? cand?.animeId ?? cand?.slug ?? null;
        if (dexId) {
          const djInfo = await fetchDex(
            `/anime/${encodeURIComponent(String(dexId))}`,
          );
          const epsArr: any[] = Array.isArray(djInfo?.episodes)
            ? djInfo.episodes
            : djInfo?.results || djInfo?.data || djInfo?.items || [];
          episodes = epsArr.map((ep: any, idx: number) => {
            const numRaw =
              ep?.number ?? ep?.episode ?? ep?.ep ?? ep?.ep_num ?? idx + 1;
            const num =
              typeof numRaw === "number" ? numRaw : Number(numRaw) || idx + 1;
            const eid = ep?.id ?? ep?.episodeId ?? `${dexId}-${num}`;
            return {
              id: String(eid),
              number: num,
              title: ep?.title || ep?.name || undefined,
              air_date: ep?.date || ep?.aired || null,
            };
          });
        }
      }
    }

    return res.json({
      episodes,
      pagination: pagination
        ? { ...pagination, last_visible_page: last }
        : null,
    });
  } catch (e: any) {
    // Fallback unsuccessful
    return res.json({ episodes: [], pagination: null });
  }
};

export const getDiscover: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const order_by = String(req.query.order_by || "popularity").toLowerCase();
    const sort = String(req.query.sort || "desc").toLowerCase();
    const genreName = String(req.query.genre || "").trim();

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    params.set("limit", "24");
    params.set("sfw", "true");

    const orderMap: Record<string, string> = {
      popularity: "popularity",
      score: "score",
      favorites: "favorites",
      ranked: "rank",
      start_date: "start_date",
      updated: "updated_at",
      trending: "members",
    };
    params.set("order_by", orderMap[order_by] || "popularity");
    params.set("sort", sort === "asc" ? "asc" : "desc");

    if (genreName) {
      const gid = await getGenreIdByName(genreName);
      if (gid) params.set("genres", String(gid));
    }

    const url = `${JIKAN_BASE}/anime?${params.toString()}`;
    const j = await fetchJson(url, 12000);

    let results = ((j?.data as any[]) || []).map(mapJikanAnimeToSummary);
    let pi = j?.pagination || {};

    if (!results.length) {
      const dj = await fetchDex("/gogoPopular/1");
      const arr: any[] = Array.isArray(dj)
        ? dj
        : dj?.results || dj?.data || dj?.items || dj?.animes || [];
      results = arr.map(mapDexAnimeToSummary).slice(0, 24);
      pi = { current_page: 1, has_next_page: false, last_visible_page: 1 };
    }

    res.json({
      results,
      pagination: {
        page: pi?.current_page ?? page,
        has_next_page: !!pi?.has_next_page,
        last_visible_page: pi?.last_visible_page ?? pi?.last_page ?? null,
      },
    });
  } catch (e: any) {
    const dj = await fetchDex("/gogoPopular/1");
    const arr: any[] = Array.isArray(dj)
      ? dj
      : dj?.results || dj?.data || dj?.items || dj?.animes || [];
    const results = arr.map(mapDexAnimeToSummary).slice(0, 24);
    if (results.length)
      return res.json({
        results,
        pagination: { page: 1, has_next_page: false, last_visible_page: 1 },
      });
    res.status(500).json({ error: e?.message || "Discover failed" });
  }
};

export const getGenres: RequestHandler = async (_req, res) => {
  try {
    const j = await fetchJson(`${JIKAN_BASE}/genres/anime`, 12000);
    const items: any[] = (j?.data as any[]) || [];
    const genres = items.map((g) => ({ id: g.mal_id, name: g.name }));
    res.json({ genres });
  } catch {
    // Gracefully fallback to empty list so UI still works
    res.json({ genres: [] });
  }
};

export const getStreaming: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^\d+$/.test(id)) return res.json({ links: [] });
    const j = await fetchJson(`${JIKAN_BASE}/anime/${id}/streaming`, 12000);
    const items: any[] = (j?.data as any[]) || [];
    const links = items
      .filter((s) => s?.url)
      .map((s) => ({ name: s?.name || s?.site || "", url: s.url }));
    res.json({ links });
  } catch {
    // If Jikan streaming providers fail, return empty (we don't have dex episodeIds here)
    res.json({ links: [] });
  }
};

export const getNewReleases: RequestHandler = async (_req, res) => {
  try {
    const key = `jikan:seasons:now`;
    let j = getCached<any>(key);
    if (!j) {
      j = await fetchJson(`${JIKAN_BASE}/seasons/now?limit=24&sfw`, 12000);
      if (j) setCached(key, j);
    }
    let results = ((j?.data as any[]) || []).map(mapJikanAnimeToSummary);

    if (!results.length) {
      const dj = await fetchDex("/upcoming/1");
      const arr: any[] = Array.isArray(dj)
        ? dj
        : dj?.results || dj?.data || dj?.items || dj?.animes || [];
      results = arr.map(mapDexAnimeToSummary).slice(0, 24);
    }

    res.json({ results });
  } catch (e: any) {
    const dj = await fetchDex("/upcoming/1");
    const arr: any[] = Array.isArray(dj)
      ? dj
      : dj?.results || dj?.data || dj?.items || dj?.animes || [];
    const results = arr.map(mapDexAnimeToSummary).slice(0, 24);
    if (results.length) return res.json({ results });
    res
      .status(500)
      .json({ error: e?.message || "Failed to fetch new releases" });
  }
};
