export function Footer() {
  return (
    <footer className="border-t bg-background/80">
      <div className="container mx-auto px-4 py-8 text-sm text-foreground/70">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              K
            </span>
            KoAnime
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <a className="hover:text-foreground" href="#">
              Terms
            </a>
            <a className="hover:text-foreground" href="#">
              Privacy
            </a>
            <a className="hover:text-foreground" href="#">
              Contact
            </a>
            <a className="hover:text-foreground" href="#">
              About
            </a>
          </nav>
        </div>
        <p className="mt-6 text-xs">
          © {new Date().getFullYear()} KoAnime. Data sourced from Jikan
          (MyAnimeList). Streaming availability varies by region/platform.
        </p>
      </div>
    </footer>
  );
}
