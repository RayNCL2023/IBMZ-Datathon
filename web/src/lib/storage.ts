// localStorage that never throws (private windows, blocked storage, SSR).
export const storage = {
    get(key: string): string | null {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Preferences simply won't persist.
        }
    },
};
