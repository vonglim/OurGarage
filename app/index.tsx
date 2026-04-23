import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { getOnboardingTermsAccepted } from '@/store/agreementsStore';

type Gate = 'loading' | 'terms' | 'home';

export default function Index() {
  const [gate, setGate] = useState<Gate>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await getOnboardingTermsAccepted();
      if (!cancelled) setGate(ok ? 'home' : 'terms');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  if (gate === 'terms') {
    return <Redirect href="/onboarding-terms" />;
  }

  return <Redirect href="/home" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ui.surfaceGrouped,
  },
});
