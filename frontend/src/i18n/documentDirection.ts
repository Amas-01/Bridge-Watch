import { SUPPORTED_LANGUAGES } from "./config";

/** Apply LTR/RTL document direction for the active locale. */
export function applyDocumentDirection(languageCode: string): void {
  const baseCode = languageCode.split("-")[0];
  const language = SUPPORTED_LANGUAGES.find((lang) => lang.code === baseCode);
  const isRtl =
    language !== undefined && "rtl" in language && language.rtl === true;

  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  document.documentElement.lang = baseCode;
}
