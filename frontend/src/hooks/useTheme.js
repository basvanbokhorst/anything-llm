import { REFETCH_LOGO_EVENT } from "@/LogoContext";
import { useState, useEffect } from "react";

const availableThemes = {
  system: "System",
  light: "Light",
  dark: "Dark",
  greenberry: "Greenberry",
};

/**
 * @typedef {'system' | 'light' | 'dark' | 'greenberry'} ThemeOption
 */

/**
 * @typedef {Object} UseThemeResult
 * @property {ThemeOption} theme - The current theme preference stored in localStorage.
 * @property {(newTheme: ThemeOption) => void} setTheme - Sets the theme preference.
 * @property {{system: string, light: string, dark: string}} availableThemes - Map of theme keys to display names.
 * @property {boolean} isLight - Whether the resolved theme is light (explicitly or via system preference).
 */

/**
 * Determines the current theme of the application.
 * "system" follows the OS preference, "light" and "dark" force that mode.
 * @returns {UseThemeResult}
 */
export function useTheme() {
  const [theme, _setTheme] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "default") return "dark"; // migrate legacy value
    return stored || "system";
  });

  const [systemTheme, setSystemTheme] = useState(() =>
    window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark"
  );

  // Listen for OS level theme changes
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e) => setSystemTheme(e.matches ? "light" : "dark");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // "greenberry" is a light-based brand theme: it reuses every light-theme
  // rule and only re-tints the CSS variables via the data-brand attribute.
  const baseTheme = resolvedTheme === "greenberry" ? "light" : resolvedTheme;
  const brand = resolvedTheme === "greenberry" ? "greenberry" : null;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", baseTheme);
    if (brand) document.documentElement.setAttribute("data-brand", brand);
    else document.documentElement.removeAttribute("data-brand");
    document.body.classList.toggle("light", baseTheme === "light");
    localStorage.setItem("theme", theme);
    window.dispatchEvent(new Event(REFETCH_LOGO_EVENT));
  }, [baseTheme, brand, theme]);

  // In development, attach keybind combinations to toggle theme
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function toggleOnKeybind(e) {
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        _setTheme((prev) => (prev === "light" ? "dark" : "light"));
      }
    }
    document.addEventListener("keydown", toggleOnKeybind);
    return () => document.removeEventListener("keydown", toggleOnKeybind);
  }, []);

  /**
   * Sets the theme of the application and runs any
   * other necessary side effects
   * @param {ThemeOption} newTheme The new theme to set
   */
  function setTheme(newTheme) {
    _setTheme(newTheme);
  }

  return {
    theme,
    setTheme,
    availableThemes,
    isLight: baseTheme === "light",
  };
}
