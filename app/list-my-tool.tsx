import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';

export default function ListMyToolScreen() {
  const router = useRouter();

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={styles.header}>
          <ScreenBackButton onPress={() => router.back()} style={styles.backHit} />
          <Text style={styles.title}>List equipment</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.bodyText}>
            This flow will let you add equipment from your garage for neighbors to rent. We have not built
            it yet—check back soon.
          </Text>
        </View>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  backHit: {
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  body: {
    paddingVertical: 24,
    paddingHorizontal: 0,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: ui.textSubtle,
  },
});
