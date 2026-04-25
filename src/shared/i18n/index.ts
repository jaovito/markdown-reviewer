import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = ["en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18next };
