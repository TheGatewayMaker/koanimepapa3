import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import {
  getTrending,
  getSearch,
  getInfo,
  getEpisodes,
  getDiscover,
  getGenres,
  getStreaming,
  getNewReleases,
} from "./routes/anime";
import {
  searchAniList,
  getAniListInfo,
  getAniListEpisodes,
} from "./routes/anilist";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Anime API proxies (Jikan)
  app.get("/api/anime/trending", getTrending);
  app.get("/api/anime/search", getSearch);
  app.get("/api/anime/info/:id", getInfo);
  app.get("/api/anime/episodes/:id", getEpisodes);
  app.get("/api/anime/discover", getDiscover);
  app.get("/api/anime/genres", getGenres);
  app.get("/api/anime/streams/:id", getStreaming);
  app.get("/api/anime/new", getNewReleases);

  // AniList API routes
  app.get("/api/anilist/search", searchAniList);
  app.get("/api/anilist/info/:id", getAniListInfo);
  app.get("/api/anilist/episodes/:id", getAniListEpisodes);

  return app;
}
