/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Fonts API key (optional): enables the full font catalogue. See .env.example. */
  readonly VITE_GOOGLE_FONTS_API_KEY?: string;
  /** Firebase web app settings (not secret; see .env.example). */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** 'fake' swaps in stand-ins for Google sign-in and Firestore (browser tests only). */
  readonly VITE_SHARING_BACKEND?: string;
}
