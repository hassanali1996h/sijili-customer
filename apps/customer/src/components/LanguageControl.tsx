import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { palette, radii } from '@debt/shared';
import { toggleLanguage } from '../lib/language';

export function LanguageControl() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function changeLanguage() {
    if (busy) return;
    setBusy(true);
    try {
      await toggleLanguage(i18n.resolvedLanguage ?? i18n.language);
    } finally {
      setBusy(false);
    }
  }

  const label = i18n.resolvedLanguage === 'ckb' ? t('app.switchToArabic') : t('app.switchToKurdish');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={() => void changeLanguage()}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{i18n.resolvedLanguage === 'ckb' ? t('app.arabic') : t('app.kurdish')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: { minHeight: 42, paddingHorizontal: 15, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  pressed: { opacity: 0.75 },
  label: { color: palette.primaryDark, fontSize: 13, fontWeight: '700' },
});

