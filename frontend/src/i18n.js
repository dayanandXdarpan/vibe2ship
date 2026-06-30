import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import hi from './locales/hi.json'
import mr from './locales/mr.json'
import ta from './locales/ta.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr }, ta: { translation: ta } },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'prastab_lang',
    },
    interpolation: { escapeValue: false },
  })

export default i18n
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'hi', name: 'Hindi',   nativeName: 'हिंदी',  flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil',   nativeName: 'தமிழ்',  flag: '🇮🇳' },
]
