import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { AnimeCard } from "../components/AnimeCard";
import { fetchDiscover, fetchGenres, DiscoverResponse } from "../lib/anime";
import { useSearchParams } from "react-router-dom";

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const initialGenre = params.get("genre") || "";

  const [q, setQ] = useState("");
  const [genre, setGenre] = useState(initialGenre);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchGenres();
        setGenres(list);
      } catch (e) {
        setGenres([]);
      }
    })();
  }, []);

  const selectedGenreValid = useMemo(() => {
    if (!genre) return "";
    const found = genres.find(
      (g) => g.name.toLowerCase() === genre.toLowerCase(),
    );
    return found?.name || "";
  }, [genre, genres]);

  async function load(p = 1, append = false) {
    setLoading(true);
    try {
      const resp = await fetchDiscover({
        q: q.trim() || undefined,
        genre: selectedGenreValid || undefined,
        page: p,
      });
      setData((prev) =>
        append && prev
          ? {
              results: [...prev.results, ...resp.results],
              pagination: resp.pagination,
            }
          : resp,
      );
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // sync URL
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (genre) next.set("genre", genre);
    setParams(next, { replace: true });
  }, [q, genre, setParams]);

  useEffect(() => {
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenreValid]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold">Discover</h1>
          <div className="w-full md:max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                load(1, false);
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anime..."
                className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
              />
            </form>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {genres.map((g) => {
            const active = g.name.toLowerCase() === genre.toLowerCase();
            return (
              <button
                key={g.id}
                className={`rounded-full border px-3 py-1 text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                onClick={() => {
                  setGenre(active ? "" : g.name);
                }}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
              {data.results.map((a) => (
                <AnimeCard key={`${a.id}-${a.title}`} anime={a} />
              ))}
            </div>
            {data.pagination.has_next_page && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => load(page + 1, true)}
                  className="rounded-md border px-4 py-2 hover:bg-accent"
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-foreground/70">
            No results found.
          </div>
        )}
      </div>
    </Layout>
  );
}
