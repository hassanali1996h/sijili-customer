import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import ckb from './locales/ckb.json';

export type AppLanguage = 'ar' | 'ckb';

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'ar' || value === 'ckb';
}

export function getDeviceLanguage(locale?: string | null): AppLanguage {
  const deviceLocale = (locale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? '').toLowerCase();
  return deviceLocale.startsWith('ckb') || deviceLocale.startsWith('ku-arab') || deviceLocale.startsWith('ku-iq')
    ? 'ckb'
    : 'ar';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources: { ar: { translation: ar }, ckb: { translation: ckb } },
    lng: 'ar',
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export async function setAppLanguage(language: AppLanguage) {
  await i18n.changeLanguage(language);
  return language;
}

export { i18n };

