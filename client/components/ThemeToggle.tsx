import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      <button
        className={`px-3 py-2 text-sm ${theme === "light" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
      >
        Light
      </button>
      <button
        className={`px-3 py-2 text-sm ${theme === "dark" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
      >
        Dark
      </button>
      <button
        className={`px-3 py-2 text-sm ${theme === "ambient" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        onClick={() => setTheme("ambient")}
        aria-pressed={theme === "ambient"}
      >
        Ambient
      </button>
    </div>
  );
}
