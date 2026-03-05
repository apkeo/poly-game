const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Origin backendu (dla socket.io, API i assetów jak /uploads). Puste = ten sam host (proxy). */
export const apiBaseUrl = base;

/**
 * Baza do ładowania assetów (modele, tekstury). Zawsze wskazuje na backend, żeby względne
 * ścieżki w GLB rozwiązywały się na backend (nie na origin frontu 5173).
 * W dev bez VITE_API_BASE_URL domyślnie http://localhost:3000.
 */
const assetBase =
  base ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? (((import.meta.env as unknown as Record<string, string | undefined>)['VITE_ASSET_ORIGIN']) ?? 'http://localhost:3000')
    : '');

/**
 * URL do endpointu API. Gdy VITE_API_BASE_URL jest puste, zwraca ścieżkę względną /api/...
 * Gdy ustawione (np. http://localhost:3000), zwraca base + /api/ + path.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path;
  const full = `api/${p}`;
  return base ? `${base}/${full}` : `/${full}`;
}

/**
 * URL do assetów serwowanych przez backend (np. /uploads/...).
 * Zawsze zwraca URL wskazujący na backend (gdy assetBase), żeby ładowanie GLB/tekstur
 * nie używało originu frontu (5173) jako bazy – inaczej drugi gracz ładuje masę zasobów z 5173.
 */
export function assetUrl(path: string): string {
  if (!path) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return assetBase ? `${assetBase.replace(/\/$/, '')}${p}` : p;
}
