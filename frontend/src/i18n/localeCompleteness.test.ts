import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ar from "./locales/ar.json";
import { getTranslationKeys } from "./translationKeys";

const localeFiles = {
  es,
  fr,
  de,
  zh,
  ja,
  ko,
  ar,
} as const;

describe("locale translation completeness", () => {
  const englishKeys = getTranslationKeys(en).sort();

  it("en.json defines the reference key set", () => {
    expect(englishKeys.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(localeFiles))(
    "%s.json contains every key from en.json",
    (_localeCode, translations) => {
      expect(getTranslationKeys(translations).sort()).toEqual(englishKeys);
    },
  );

  it.each(Object.entries(localeFiles))(
    "%s.json does not define extra keys beyond en.json",
    (_localeCode, translations) => {
      const localeKeys = new Set(getTranslationKeys(translations));
      for (const key of englishKeys) {
        expect(localeKeys.has(key)).toBe(true);
      }
      expect(localeKeys.size).toBe(englishKeys.length);
    },
  );
});
