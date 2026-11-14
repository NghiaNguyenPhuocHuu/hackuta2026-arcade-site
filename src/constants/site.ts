/** Marketing site: the brand link in the sidebar goes here (same as profile). */
export const LANDING_URL = import.meta.env.VITE_LANDING_URL?.trim() || "https://hackuta.com";

/**
 * The participant portal (profile). "Back to profile" links and the signed-out
 * screen send hackers here. Set VITE_PROFILE_URL to the real dashboard URL.
 */
export const PROFILE_URL = import.meta.env.VITE_PROFILE_URL?.trim() || "https://hackuta.com";
