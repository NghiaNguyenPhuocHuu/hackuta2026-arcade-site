/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
  readonly VITE_PROFILE_URL?: string
  /** "live" reads the arcade from Convex; anything else uses the mock. */
  readonly VITE_ARCADE_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
