// Diferențele dintre site și aplicația Tauri (D51), adunate într-un singur loc.
// Pe site: refresh token-ul stă în localStorage, iar login-ul Steam se face în același tab.
// În aplicație: tokenul stă în Keychain / Credential Manager (comenzile secure_* din app/src-tauri/src/lib.rs),
// iar login-ul Steam se deschide în browserul sistemului și revine prin achievementhub://auth/callback.
// Pachetele @tauri-apps se încarcă doar în aplicație (import dinamic), deci site-ul nu le descarcă.

export const isApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

// Stocarea refresh token-ului: aceeași interfață pe site și în aplicație.
export const secureStore = {
  get: (key: string): Promise<string | null> =>
    isApp ? invoke<string | null>('secure_get', { key }) : Promise.resolve(localStorage.getItem(key)),
  set: (key: string, value: string): Promise<void> =>
    isApp ? invoke('secure_set', { key, value }) : Promise.resolve(localStorage.setItem(key, value)),
  delete: (key: string): Promise<void> =>
    isApp ? invoke('secure_delete', { key }) : Promise.resolve(localStorage.removeItem(key)),
};

// Deschide o adresă externă: în aplicație în browserul sistemului, pe site în tab-ul curent.
export async function openExternal(url: string) {
  if (!isApp) return window.location.assign(url);
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  // Browserul sistemului cere o adresă http(s) completă. În dezvoltare (fără VITE_API_URL) linkul e relativ („/api/...”),
  // iar pe iOS pagina are adresa tauri://localhost, pe care Safari nu o poate deschide; de aceea îl completăm cu
  // serverul Vite (http://localhost:5173, care trimite /api la API prin proxy).
  const base = window.location.protocol.startsWith('http') ? window.location.href : 'http://localhost:5173';
  await openUrl(new URL(url, base).href);
}

// În aplicație: primește link-urile achievementhub://auth/callback#... și le dă mai departe ca fragment („#...”).
export async function onDeepLink(handle: (fragment: string) => void): Promise<() => void> {
  if (!isApp) return () => {};
  const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');
  const forward = (urls: string[] | null) => {
    const url = urls?.find((u) => u.startsWith('achievementhub://auth/callback'));
    if (url) handle(new URL(url).hash.slice(1));
  };
  forward(await getCurrent()); // aplicația a fost pornită chiar de link
  return onOpenUrl(forward);
}
