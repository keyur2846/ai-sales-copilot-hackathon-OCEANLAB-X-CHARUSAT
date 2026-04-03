import { initializeApp, getApps, cert, getApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let _db: Firestore | null = null;

export function getAdminDb(): Firestore {
  if (_db) return _db;

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "{}")
          ),
        });

  _db = getFirestore(app);
  return _db;
}

/** @deprecated Use getAdminDb() for lazy init — this breaks builds without env vars */
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    return (getAdminDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
