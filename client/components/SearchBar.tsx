import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchItem {
  mal_id: number;
  title: string;
  image_url?: string;
  type?: string;
  year?: number | null;
}

export function SearchBar({
  onSelect,
}: {
  onSelect: (item: SearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debounced = useMemo(() => {
    let t: any;
    return (q: string) => {
      clearTimeout(t);
      t = setTimeout(() => search(q), 250);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function search(q: string) {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setOpen(true);
    } catch (e) {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          debounced(e.target.value);
        }}
        placeholder="Search anime..."
        className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
      />
      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-md border bg-background shadow-xl">
          {loading && (
            <div className="p-3 text-sm text-foreground/60">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-foreground/60">No results</div>
          )}
          <ul className="max-h-80 overflow-auto scrollbar-thin">
            {results.map((item) => (
              <li
                key={item.mal_id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  onSelect(item);
                }}
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="h-10 w-8 rounded object-cover"
                  />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {item.title}
                  </div>
                  <div className="text-xs text-foreground/60">
                    {item.type ?? ""} {item.year ? `• ${item.year}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
