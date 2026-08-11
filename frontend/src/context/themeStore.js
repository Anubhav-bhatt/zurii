import { createContext, useContext } from 'react';

/**
 * The theme context and its hook, kept out of ThemeContext.jsx.
 *
 * react-refresh/only-export-components requires a file that exports a component
 * to export nothing else, otherwise Fast Refresh silently stops working for it.
 * The provider is a component and lives next door; the context object and the
 * hook are not, so they live here.
 */

export const THEME_KEY = 'zurii_theme';

export const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
