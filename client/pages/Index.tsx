import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { BannerCarousel } from "../components/BannerCarousel";
import type { BannerItem } from "../components/BannerCarousel";
import { AnimeCard } from "../components/AnimeCard";
import { fetchTrending, fetchNewReleases } from "../lib/anime";

const BANNERS: BannerItem[] = [
  {
    id: 16498,
    title: "Attack on Titan",
    image: "https://cdn.myanimelist.net/images/anime/10/47347.jpg",
    year: 2013,
    type: "TV",
  },
  {
    id: 38000,
    title: "Demon Slayer: Kimetsu no Yaiba",
    image: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg",
    year: 2019,
    type: "TV",
  },
  {
    id: 40748,
    title: "Jujutsu Kaisen",
    image: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg",
    year: 2020,
    type: "TV",
  },
  {
    id: 21,
    title: "One Piece",
    image: "https://cdn.myanimelist.net/images/anime/6/73245.jpg",
    year: 1999,
    type: "TV",
  },
  {
    id: 44511,
    title: "Chainsaw Man",
    image: "https://cdn.myanimelist.net/images/anime/1806/126216.jpg",
    year: 2022,
    type: "TV",
  },
  {
    id: 50265,
    title: "SPY x FAMILY",
    image: "https://cdn.myanimelist.net/images/anime/1441/122795.jpg",
    year: 2022,
    type: "TV",
  },
  {
    id: 41467,
    title: "Bleach: Sennen Kessen-hen",
    image: "https://cdn.myanimelist.net/images/anime/1764/126627.jpg",
    year: 2022,
    type: "TV",
  },
  {
    id: 31964,
    title: "My Hero Academia",
    image: "https://cdn.myanimelist.net/images/anime/10/78745.jpg",
    year: 2016,
    type: "TV",
  },
  {
    id: 1735,
    title: "Naruto: Shippuuden",
    image: "https://cdn.myanimelist.net/images/anime/5/17407.jpg",
    year: 2007,
    type: "TV",
  },
  {
    id: 11757,
    title: "Sword Art Online",
    image: "https://cdn.myanimelist.net/images/anime/11/39717.jpg",
    year: 2012,
    type: "TV",
  },
];

export default function Index() {
  const [banner, setBanner] = useState<BannerItem[]>(BANNERS);
  const [newReleases, setNewReleases] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [newR, trend] = await Promise.all([
          fetchNewReleases(),
          fetchTrending(),
        ]);
        setNewReleases(newR);
        setTrending(trend);

        const toBanner: BannerItem[] = (trend || [])
          .slice(0, 10)
          .map((a: any) => ({
            id: a.id,
            title: a.title,
            image: a.image,
            description: truncateText(a.synopsis || ""),
            rating: typeof a.rating === "number" ? a.rating : null,
            subDub: a.subDub || null,
            year: a.year ?? null,
            type: a.type ?? null,
          }));
        if (toBanner.length) setBanner(toBanner);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function truncateText(s: string, max = 160) {
    const text = (s || "").toString().replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const last = cut.lastIndexOf(" ");
    return cut.slice(0, last > 80 ? last : max) + "…";
  }

  return (
    <Layout>
      <section className="relative">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <BannerCarousel items={banner} />
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 md:py-8">
        <h2 className="mb-4 text-lg font-semibold md:text-2xl">New Releases</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {newReleases.slice(0, 10).map((a, idx) => (
              <div key={a.id} className="flex flex-col">
                <AnimeCard anime={a} />
                <div className="mt-2 flex items-center justify-center">
                  <span className="rounded-full border px-3 py-1 text-sm font-semibold">
                    {idx + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="container mx-auto px-4 py-6 md:py-8">
        <div className="rounded-md border p-4 md:p-6">
          <h3 className="mb-3 text-base font-semibold md:text-lg">
            Browse by Genre
          </h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {GENRES.slice(0, 10).map((g) => (
              <a
                key={g}
                href={`/discover?genre=${encodeURIComponent(g)}`}
                className="whitespace-nowrap rounded-full border px-3 py-1 text-sm hover:bg-accent"
              >
                {g}
              </a>
            ))}
            <details className="relative">
              <summary className="list-none cursor-pointer rounded-full border px-3 py-1 text-sm hover:bg-accent">
                More
              </summary>
              <div className="absolute z-10 mt-2 max-h-64 w-56 overflow-auto rounded-md border bg-background p-2 shadow-md">
                {GENRES.map((g) => (
                  <a
                    key={g}
                    href={`/discover?genre=${encodeURIComponent(g)}`}
                    className="block rounded px-2 py-1 text-sm hover:bg-accent"
                  >
                    {g}
                  </a>
                ))}
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold md:text-2xl">Trending Now</h2>
          <a href="/discover" className="text-sm text-primary hover:underline">
            See all
          </a>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {trending.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

const GENRES = [
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
  "Ecchi",
  "Isekai",
  "Martial Arts",
  "Military",
  "Historical",
  "School",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Josei",
];
