type TranslationTree = Record<string, unknown>;

/** Recursively collect dot-notation keys from a translation object. */
export function getTranslationKeys(
  translations: TranslationTree,
  prefix = "",
): string[] {
  return Object.entries(translations).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return getTranslationKeys(value as TranslationTree, path);
    }

    return [path];
  });
}
