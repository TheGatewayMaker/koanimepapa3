import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    | string
    | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as
    | string
    | undefined,
};

export function isFirebaseConfigured() {
  return !!(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.appId
  );
}

export function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Please set env variables.");
  }
  const app = getApps().length ? getApps()[0] : initializeApp(config as any);
  const auth = getAuth(app);
  return { app, auth };
}

let analyticsPromise: Promise<Analytics | null> | null = null;
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((ok) => (ok ? getAnalytics(getApps()[0]!) : null))
      .catch(() => null);
  }
  return analyticsPromise;
}
