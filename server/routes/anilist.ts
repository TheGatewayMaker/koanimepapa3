import { RequestHandler } from "express";

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

import { safeFetch } from "../utils/safe-fetch";

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

function normalizeTitle(t: any): string {
  return (t?.english ||
    t?.romaji ||
    t?.native ||
    t?.userPreferred ||
    "") as string;
}

function mapMediaToSummary(m: any) {
  const id: number = m?.id;
  const title: string = normalizeTitle(m?.title);
  const image: string =
    m?.coverImage?.extraLarge ||
    m?.coverImage?.large ||
    m?.coverImage?.medium ||
    "";
  const type: string | undefined = m?.format || undefined;
  const year: number | null = m?.seasonYear ?? null;
  const rating: number | null =
    typeof m?.averageScore === "number"
      ? Math.round((m.averageScore as number) / 10)
      : null;
  const synopsis: string = (m?.description || "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const genres: string[] = Array.isArray(m?.genres) ? m.genres : [];
  return { id, title, image, type, year, rating, synopsis, genres };
}

export const searchAniList: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ results: [] });

    const key = `al:search:${q.toLowerCase()}`;
    let data = getCached<any>(key);
    if (!data) {
      data = await gql<any>(
        `query($q:String,$page:Int,$perPage:Int){
          Page(page:$page, perPage:$perPage){
            media(search:$q, type:ANIME, sort:[SEARCH_MATCH, POPULARITY_DESC]){
              id
              title{ romaji english native userPreferred }
              coverImage{ medium large extraLarge }
              seasonYear
              averageScore
              format
              genres
              description(asHtml:false)
              popularity
            }
          }
        }`,
        { q, page: 1, perPage: 20 },
      );
      if (data) setCached(key, data);
    }

    const items: any[] = data?.Page?.media || [];
    const results = items.map(mapMediaToSummary);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "AniList search failed" });
  }
};

export const getAniListInfo: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const key = `al:info:${id}`;
    let data = getCached<any>(key);
    if (!data) {
      data = await gql<any>(
        `query($id:Int!){
          Media(id:$id, type:ANIME){
            id
            title{ romaji english native userPreferred }
            coverImage{ large extraLarge }
            seasonYear
            averageScore
            format
            genres
            description(asHtml:false)
            relations{
              edges{ relationType(version:2) node{ id title{ romaji english native userPreferred } type format seasonYear } }
            }
          }
        }`,
        { id },
      );
      if (data) setCached(key, data);
    }

    const m = data?.Media;
    if (!m) return res.status(404).json({ error: "Not found" });

    const base = mapMediaToSummary(m);

    // Build seasons chain using relationType: PREQUEL/SEQUEL
    const edges = Array.isArray(m?.relations?.edges) ? m.relations.edges : [];
    const idToNode: Record<number, any> = {};
    const prequels: any[] = [];
    const sequels: any[] = [];
    for (const e of edges) {
      const r = String(e?.relationType || "").toUpperCase();
      const node = e?.node;
      if (node && (node.type === "ANIME" || node.type === "MANGA" || true)) {
        idToNode[node.id] = node;
        if (r === "PREQUEL") prequels.push(node);
        if (r === "SEQUEL") sequels.push(node);
      }
    }

    // Prefer TV/ONA in chain
    function pickTv(nodes: any[]): any | null {
      const tv = nodes.find((n) => n?.format === "TV" || n?.format === "ONA");
      return tv || nodes[0] || null;
    }

    const seasons: { id: number; number: number; title?: string }[] = [];
    const back: any[] = [];
    const fwd: any[] = [];

    let cur = pickTv(prequels) ? idToNode[pickTv(prequels)!.id] : null;
    const seen = new Set<number>([id]);
    for (let i = 0; i < 3 && cur; i++) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      back.push(cur);
      const nextEdges = Array.isArray(cur?.relations?.edges)
        ? cur.relations.edges
        : [];
      const prev = pickTv(
        nextEdges
          .filter(
            (e: any) => (e?.relationType || "").toUpperCase() === "PREQUEL",
          )
          .map((e: any) => e.node),
      );
      cur = prev ? idToNode[prev.id] || prev : null;
    }

    cur = pickTv(sequels) ? idToNode[pickTv(sequels)!.id] : null;
    for (let i = 0; i < 3 && cur; i++) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      fwd.push(cur);
      const nextEdges = Array.isArray(cur?.relations?.edges)
        ? cur.relations.edges
        : [];
      const nxt = pickTv(
        nextEdges
          .filter(
            (e: any) => (e?.relationType || "").toUpperCase() === "SEQUEL",
          )
          .map((e: any) => e.node),
      );
      cur = nxt ? idToNode[nxt.id] || nxt : null;
    }

    const chain = [...back.reverse(), { id, title: m.title }, ...fwd];
    for (let i = 0; i < chain.length; i++) {
      const n = chain[i];
      seasons.push({ id: n.id, number: i + 1, title: normalizeTitle(n.title) });
    }

    res.json({ ...base, seasons });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "AniList info failed" });
  }
};

export const getAniListEpisodes: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.json({ episodes: [], pagination: null });

    const key = `al:eps:${id}`;
    let data = getCached<any>(key);
    if (!data) {
      data = await gql<any>(
        `query($id:Int!,$page:Int,$perPage:Int){
          Media(id:$id, type:ANIME){
            id
            episodes
            streamingEpisodes{ title url thumbnail site }
            airingSchedule(page:$page, perPage:$perPage){
              pageInfo{ currentPage hasNextPage lastPage }
              nodes{ id episode airingAt }
            }
          }
        }`,
        { id, page: 1, perPage: 50 },
      );
      if (data) setCached(key, data);
    }

    const m = data?.Media;
    if (!m) return res.json({ episodes: [], pagination: null });

    const nodes: any[] = m?.airingSchedule?.nodes || [];
    const episodes = nodes
      .filter((n) => typeof n?.episode === "number")
      .map((n) => ({
        id: String(n.id),
        number: n.episode as number,
        title: undefined as string | undefined,
        air_date: n.airingAt ? new Date(n.airingAt * 1000).toISOString() : null,
      }))
      .sort((a, b) => a.number - b.number);

    // Include streaming episodes if present (they may have titles)
    const streams: any[] = Array.isArray(m?.streamingEpisodes)
      ? m.streamingEpisodes
      : [];
    for (const s of streams) {
      const match = episodes.find(
        (e) => e.number === (Number((s.title || "").match(/\d+/)?.[0]) || -1),
      );
      if (match && s.title) match.title = s.title;
    }

    const pi = m?.airingSchedule?.pageInfo || null;
    res.json({
      episodes,
      pagination: pi
        ? {
            page: pi.currentPage,
            has_next_page: !!pi.hasNextPage,
            last_visible_page: pi.lastPage ?? null,
          }
        : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "AniList episodes failed" });
  }
};
