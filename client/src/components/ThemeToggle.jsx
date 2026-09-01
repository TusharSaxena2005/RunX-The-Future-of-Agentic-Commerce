import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, toggleTheme } from '../services/theme.js';

export default function ThemeToggle() {
    const [theme, setTheme] = useState(getTheme());

    useEffect(() => {
        const onThemeChange = (event) => setTheme(event.detail || getTheme());
        window.addEventListener('runx-theme-change', onThemeChange);
        return () => window.removeEventListener('runx-theme-change', onThemeChange);
    }, []);

    const dark = theme === 'dark';

    return (
        <button
            type="button"
            className="icon-button"
            onClick={() => setTheme(toggleTheme())}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );
}
