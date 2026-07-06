import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';
import fa from './locales/fa.json';

export type LanguageCode = 'en' | 'es' | 'ca' | 'fa';

export const languages: Array<{
  code: LanguageCode;
  name: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}> = [
  { code: 'en', name: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'ca', name: 'Català', flag: '🇦🇩', dir: 'ltr' },
  { code: 'fa', name: 'دری', flag: '🇦🇫', dir: 'rtl' },
];

function applyDocumentLanguage(language: string | undefined) {
  const code = (language ?? 'en').split('-')[0] as LanguageCode;
  const selected = languages.find((item) => item.code === code) ?? languages[0];
  document.documentElement.lang = selected.code;
  document.documentElement.dir = selected.dir;
}

const resources = {
  en: { translation: en },
  es: { translation: es },
  ca: { translation: ca },
  fa: { translation: fa },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })
  .then(() => applyDocumentLanguage(i18n.resolvedLanguage ?? i18n.language));

i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
