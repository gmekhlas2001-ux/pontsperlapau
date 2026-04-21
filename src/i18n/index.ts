import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';
import fa from './locales/fa.json';

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
  });

export default i18n;

export const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'ca', name: 'Català', flag: '🇦🇩', dir: 'ltr' },
  { code: 'fa', name: 'دری', flag: '🇦🇫', dir: 'rtl' },
];

export type LanguageCode = 'en' | 'es' | 'ca' | 'fa';
