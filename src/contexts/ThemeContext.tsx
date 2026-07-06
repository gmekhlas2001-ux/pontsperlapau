import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const forceLightTheme = () => {
  if (typeof window === 'undefined') return;

  window.document.documentElement.classList.remove('dark');
  window.localStorage.setItem('theme', 'light');
};

const lightThemeContext: ThemeContextType = {
  theme: 'light',
  setTheme: forceLightTheme,
  resolvedTheme: 'light',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    forceLightTheme();
  }, []);

  return (
    <ThemeContext.Provider value={lightThemeContext}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
