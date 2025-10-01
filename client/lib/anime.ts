export interface ApiAnimeSummary {
  id: number;
  title: string;
  image: string;
  type?: string;
  year?: number | null;
  rating?: number | null;
  subDub?: "SUB" | "DUB" | "SUB/DUB" | null;
  genres?: string[];
  synopsis?: string;
  seasons?: { id: number; number: number; title?: string }[];
  isNewSeason?: boolean;
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const merged = { ...init, signal: controller.signal } as RequestInit;
  return fetch(input, merged).finally(() => clearTimeout(timer));
}

export async function fetchTrending(): Promise<ApiAnimeSummary[]> {
  try {
    const res = await fetchWithTimeout("/api/anime/trending");
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.results as ApiAnimeSummary[];
  } catch {
    return [];
  }
}

export interface DiscoverParams {
  q?: string;
  genre?: string;
  page?: number;
  order_by?: string;
  sort?: "asc" | "desc";
}
export interface DiscoverResponse {
  results: ApiAnimeSummary[];
  pagination: {
    page: number;
    has_next_page: boolean;
    last_visible_page: number | null;
  };
}
export async function fetchDiscover(
  params: DiscoverParams = {},
): Promise<DiscoverResponse> {
  try {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.genre) qs.set("genre", params.genre);
    if (params.page) qs.set("page", String(params.page));
    if (params.order_by) qs.set("order_by", params.order_by);
    if (params.sort) qs.set("sort", params.sort);
    const res = await fetchWithTimeout(`/api/anime/discover?${qs.toString()}`);
    if (!res.ok) {
      return {
        results: [],
        pagination: {
          page: params.page || 1,
          has_next_page: false,
          last_visible_page: null,
        },
      };
    }
    return await res.json();
  } catch {
    return {
      results: [],
      pagination: {
        page: params.page || 1,
        has_next_page: false,
        last_visible_page: null,
      },
    };
  }
}

export interface GenreItem {
  id: number;
  name: string;
}
export async function fetchGenres(): Promise<GenreItem[]> {
  try {
    const res = await fetchWithTimeout("/api/anime/genres");
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.genres as GenreItem[];
  } catch {
    return [];
  }
}

export interface StreamLink {
  name: string;
  url: string;
}
export async function fetchStreams(
  id: number,
  ep?: number,
  sub: "sub" | "dub" = "sub",
): Promise<StreamLink[]> {
  try {
    const qs = new URLSearchParams();
    if (ep) qs.set("ep", String(ep));
    if (sub) qs.set("sub", sub);
    const res = await fetchWithTimeout(
      `/api/anime/streams/${id}?${qs.toString()}`,
    );
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.links as StreamLink[];
  } catch {
    return [];
  }
}

export async function fetchNewReleases(): Promise<ApiAnimeSummary[]> {
  try {
    const res = await fetchWithTimeout("/api/anime/new");
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.results as ApiAnimeSummary[];
  } catch {
    return [];
  }
}

export async function fetchAnimeInfo(
  id: number,
): Promise<ApiAnimeSummary | null> {
  try {
    const res = await fetchWithTimeout(`/api/anime/info/${id}`);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export interface EpisodeItem {
  id: string;
  number: number;
  title?: string;
  air_date?: string | null;
}
export interface EpisodesResponse {
  episodes: EpisodeItem[];
  pagination?: {
    has_next_page?: boolean;
    last_visible_page?: number | null;
    items?: any;
  } | null;
}
export async function fetchEpisodes(
  id: number,
  page = 1,
): Promise<EpisodesResponse> {
  try {
    const res = await fetchWithTimeout(
      `/api/anime/episodes/${id}?page=${page}`,
      {},
      12000,
    );
    if (res.ok) {
      const data = await res.json();
      return normalizeEpisodesResponse(data);
    }
    console.error("episodes endpoint returned", res.status);
  } catch {}
  return { episodes: [], pagination: null };
}

function normalizeEpisodesResponse(data: any): EpisodesResponse {
  const base = data.episodes || data.results || data.data || [];
  const episodes = base.map((ep: any, idx: number) => {
    const number =
      ep.number ??
      ep.episode ??
      ep.episode_number ??
      ep.ep ??
      ep.ep_num ??
      null;
    const title =
      ep.title || ep.name || ep.episodeTitle || ep.title_english || undefined;
    const air_date = ep.air_date ?? ep.aired ?? ep.date ?? null;
    const n = typeof number === "number" ? number : Number(number) || 0;
    const finalNum = n > 0 ? n : idx + 1;
    const id = ep.id ?? ep.mal_id ?? `${ep.mal_id ?? ""}-${finalNum}`;
    return {
      id: String(id),
      number: finalNum,
      title,
      air_date,
    };
  });

  // Normalize pagination to include last_visible_page if possible
  const pagination = data.pagination || data.meta || null;
  if (pagination && typeof pagination === "object") {
    const last =
      pagination.last_visible_page ??
      pagination.last_page ??
      pagination.total_pages ??
      pagination.totalPages ??
      null;
    return { episodes, pagination: { ...pagination, last_visible_page: last } };
  }
  return { episodes, pagination: null };
}
