import { useState } from "react";
import { Layout } from "../components/Layout";
import { getFirebase, isFirebaseConfigured } from "../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function Login() {
  const configured = isFirebaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const { auth } = getFirebase();
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto w-full max-w-md rounded-xl border p-6 shadow-sm">
          <h1 className="text-center text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-center text-sm text-foreground/70">
            Log in to continue watching
          </p>
          {!configured && (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              Firebase isn't configured. Add VITE_FIREBASE_* env vars in project
              settings to enable authentication.
            </div>
          )}
          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="text-sm">Email</label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm">Password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground"
              disabled={!configured || loading}
            >
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
          <div className="mt-4 text-center text-sm">
            New here?{" "}
            <a href="/signup" className="text-primary underline">
              Create an account
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
