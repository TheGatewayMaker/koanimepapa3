import { Layout } from "../components/Layout";

export default function Watchlist() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="mt-2 text-foreground/70">
          Sign in to save shows to your watchlist. Firebase integration will
          enable syncing.
        </p>
      </div>
    </Layout>
  );
}
