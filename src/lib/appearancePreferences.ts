/**
 * DLI Academic Pro appearance preferences v2.0.
 *
 * Presentation-only choices are saved per browser; the existing cloud-backed
 * light/dark preference remains independent and authoritative in AppShell.
 * Nothing in these settings affects DLI account roles or Supabase RLS.
 */
export type AppearanceSettings = {
  theme: 'light' | 'dark' | 'system';
  accent: 'blue' | 'gold' | 'teal' | 'purple' | 'emerald';
  density: 'comfortable' | 'compact';
  textSize: 'standard' | 'large' | 'smaller';
  motion: 'system' | 'reduced';
};

const STORAGE_KEY = 'dli-appearance-v1';

export const defaultAppearance: AppearanceSettings = {
  theme: 'system',
  accent: 'blue',
  density: 'comfortable',
  textSize: 'standard',
  motion: 'system',
};

function isOption<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

export function readAppearance(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultAppearance };
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object') return { ...defaultAppearance };
    const current = input as Record<string, unknown>;
    return {
      theme: isOption(current.theme, ['light', 'dark', 'system'])
        ? current.theme : defaultAppearance.theme,
      accent: isOption(current.accent, ['blue', 'gold', 'teal', 'purple', 'emerald'])
        ? current.accent : defaultAppearance.accent,
      density: isOption(current.density, ['comfortable', 'compact'])
        ? current.density : defaultAppearance.density,
      textSize: isOption(current.textSize, ['standard', 'large', 'smaller'])
        ? current.textSize : defaultAppearance.textSize,
      motion: isOption(current.motion, ['system', 'reduced'])
        ? current.motion : defaultAppearance.motion,
    };
  } catch {
    return { ...defaultAppearance };
  }
}

export function applyAppearance(value: AppearanceSettings): void {
  const root = document.documentElement;
  root.dataset.dliAccent = value.accent;
  root.dataset.dliDensity = value.density;
  root.dataset.dliText = value.textSize;
  root.dataset.dliMotion = value.motion;
  if (value.theme === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    root.dataset.theme = value.theme;
  }
}

export function initializeAppearance(): void {
  applyAppearance(readAppearance());
}

export function saveAppearance(value: AppearanceSettings): boolean {
  applyAppearance(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    // Appearance remains applied for the current page even when storage is blocked.
    return false;
  }
}
