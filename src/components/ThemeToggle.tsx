import React, { useEffect, useState } from 'react';
import { getTheme, toggleTheme, type Theme } from '../utils/theme';
import { SunIcon, MoonIcon } from './ui/icons';

const ThemeToggle: React.FC = () => {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const handleToggle = () => {
    setThemeState(toggleTheme());
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="theme-toggle"
      className="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/10 flex items-center justify-center text-muted hover:text-secondary transition-colors shrink-0"
    >
      {theme === 'dark' ? <SunIcon className="w-[18px] h-[18px]" /> : <MoonIcon className="w-[18px] h-[18px]" />}
    </button>
  );
};

export default ThemeToggle;