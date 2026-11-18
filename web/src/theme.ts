// Tema interfeței: se alege din pagina Settings și se ține în localStorage (e o preferință a dispozitivului, nu a contului).
// Tema se aplică prin atributul data-theme pe <html>; culorile ei sunt tokenurile din index.css.
// Teme: Leonida (apus de soare, D49), Dark și Light (alb-negru, D58). O temă nouă = încă un rând aici + tokenurile ei în CSS.
export const themes = [
  { id: 'leonida', name: 'Leonida', description: 'Sunset glass over the city of Vice City.', background: '#1a0b2e' },
  { id: 'dark', name: 'Dark', description: 'Black and white.', background: '#050505' },
  { id: 'light', name: 'Light', description: 'White and black.', background: '#ececee' },
] as const;

export type ThemeId = (typeof themes)[number]['id'];

const STORAGE_KEY = 'theme';

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (themes.some((theme) => theme.id === saved)) return saved as ThemeId;
  } catch { /* localStorage indisponibil: rămâne tema implicită */ }
  return 'leonida';
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  // Culoarea de sub pagină (vizibilă la „bounce” pe iOS / macOS) urmează tema.
  document.documentElement.style.background = themes.find((theme) => theme.id === id)!.background;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignorat */ }
}
