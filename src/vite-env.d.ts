/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
  readonly VITE_PROFILE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
