// Tema interfeței: se alege din pagina Settings și se ține în localStorage (e o preferință a dispozitivului, nu a contului).
// Tema se aplică prin atributul data-theme pe <html>; culorile ei sunt tokenurile din index.css.
// Deocamdată există o singură temă, Leonida (apus de soare, D49); o temă nouă = încă un rând aici + tokenurile ei în CSS.
export const themes = [
  { id: 'leonida', name: 'Leonida', description: 'Sunset glass: liquid glass over a beach at golden hour.' },
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
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignorat */ }
}
