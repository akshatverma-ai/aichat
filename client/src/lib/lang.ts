export interface LangOption {
  code: string;   // BCP-47, e.g. "en-US"
  name: string;   // Display name sent to AI, e.g. "English"
  label: string;  // UI label
}

export const LANGUAGES: LangOption[] = [
  { code: "en-US", name: "English", label: "🌐 ENGLISH" },
  { code: "hi-IN", name: "Hindi",   label: "🌐 हिंदी"   },
];

const STORAGE_KEY = "aichat_lang";

export function getStoredLang(): LangOption {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { code?: string; name?: string };
      const match = LANGUAGES.find(
        (l) => l.code === parsed.code || l.name === parsed.name
      );
      if (match) return match;
    }
  } catch {}
  return LANGUAGES[0];
}

export function saveLang(lang: LangOption): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: lang.code, name: lang.name }));
  } catch {}
}
