export const THEME_STORAGE_KEY = "ampere-theme";
export type Theme = "dark" | "light";

export const DARK_THEME_COLOR = "#0b1424";
export const LIGHT_THEME_COLOR = "#f7f9fc";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? LIGHT_THEME_COLOR : DARK_THEME_COLOR);
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export function setStoredTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// نص السكربت المُضمَّن مباشرة قبل الرسم لمنع وميض الوضع الخاطئ (Flash of Wrong Theme).
// ثابت بالكامل — لا يحتوي أي بيانات من المستخدم.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (t === 'light') {
      document.documentElement.dataset.theme = 'light';
    }
  } catch (e) {}
})();
`;
