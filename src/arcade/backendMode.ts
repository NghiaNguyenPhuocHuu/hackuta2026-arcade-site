import { backendModeFrom } from "./liveSession";

/** Read once per page load: hooks pick their implementation from it. */
export const BACKEND_MODE = backendModeFrom(import.meta.env.VITE_ARCADE_BACKEND, window.location.search);
export const IS_LIVE = BACKEND_MODE === "live";
