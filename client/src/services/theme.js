const THEME_KEY = 'runx_theme';

export function getTheme() {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new CustomEvent('runx-theme-change', { detail: next }));
    return next;
}

export function initTheme() {
    applyTheme(getTheme());
}

export function toggleTheme() {
    return applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
