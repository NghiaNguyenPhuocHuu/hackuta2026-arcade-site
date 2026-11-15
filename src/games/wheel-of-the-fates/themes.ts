/**
 * Player settings for Wheel of the Fates: wheel skin, table cloth, spin speed.
 * Sound is the arcade-wide game sound switch (../sound.ts).
 * None of it touches points. Saved per browser.
 */

export const WHEEL_SKINS = [
  { id: "marble", name: "Marble temple" },
  { id: "bronze", name: "Bronze" },
  { id: "night-sky", name: "Night sky" },
  { id: "underworld", name: "Underworld" },
] as const;

export const TABLE_CLOTHS = [
  { id: "midnight", name: "Midnight blue" },
  { id: "gold", name: "Olympus gold" },
  { id: "deep-sea", name: "Deep sea" },
  { id: "ember", name: "Ember" },
] as const;

export type WheelSkin = (typeof WHEEL_SKINS)[number]["id"];
export type TableCloth = (typeof TABLE_CLOTHS)[number]["id"];
export type RouletteSettings = { wheel: WheelSkin; table: TableCloth; fast: boolean };

export const DEFAULT_SETTINGS: RouletteSettings = { wheel: "marble", table: "midnight", fast: false };

const STORAGE_KEY = "wof-settings";

export function loadSettings(): RouletteSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const value = JSON.parse(raw) as Partial<RouletteSettings>;
    return {
      wheel: WHEEL_SKINS.some((s) => s.id === value.wheel) ? (value.wheel as WheelSkin) : DEFAULT_SETTINGS.wheel,
      table: TABLE_CLOTHS.some((s) => s.id === value.table) ? (value.table as TableCloth) : DEFAULT_SETTINGS.table,
      fast: value.fast === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: RouletteSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}
