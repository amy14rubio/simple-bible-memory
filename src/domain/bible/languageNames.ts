/**
 * The names of the languages the translation picker lists (about 1,200: a phone knows the names of about fifty of them, and
 * would show the rest as codes like "cak"). The names come from YouVersion, in English and Spanish, kept in languageNames.json by
 * scripts/make-language-names.mjs (run it again when YouVersion adds translations in a new language). The file is loaded the first
 * time the picker opens, so it is not part of the app's first load.
 */
let table: Record<string, string[]> | null = null;

export async function loadLanguageNames(): Promise<void> {
  table ??= (await import('./languageNames.json')).default as Record<string, string[]>;
}

/**
 * A language's name in the app's language ("fr" is "French" or "Francés"): the file first, then the phone's own; null for the few it has none for (the picker
 * then shows the code). The names are listed on their own, so they start with a capital letter: Spanish writes "inglés" and "español" in lower case inside a
 * sentence (that is how YouVersion and the phone give them), but a list item is "Inglés", "Español".
 */
export function languageName(code: string, appLanguage: string): string | null {
  const names = table?.[code];
  const phone = () => { try { const n = new Intl.DisplayNames([appLanguage], { type: 'language', fallback: 'none' }).of(code); return n && n !== code ? n : null; } catch { return null; } };
  const name = appLanguage === 'es' ? names?.[1] ?? phone() ?? names?.[0] ?? null : names?.[0] ?? phone(); // Spanish: a Spanish name if there is one, else English
  return name ? name.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(appLanguage)) : null; // the first letter (a name may begin with an apostrophe)
}
