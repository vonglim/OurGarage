import { Stack, useLocalSearchParams, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RentalWizardProvider } from '@/components/rentalWizard/RentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import { buildRentalWizardContext } from '@/lib/rentalWizard';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { registerRentalDevContext, unregisterRentalDevContext } from '@/lib/rentalSimulation';
import { getSupabase } from '@/lib/supabase';
import { ui } from '@/constants/appUi';

export default function RentalWizardLayout() {
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const pathname = usePathname();
  const me = useAuthUserId();
  const [ctx, setCtx] = useState<RentalWizardContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!rentalId || !me) return;
    const supabase = getSupabase();
    const next = await buildRentalWizardContext(supabase, rentalId, me);
    if (!next) {
      setError('This rental is not available for the guided flow.');
      setCtx(null);
    } else {
      setCtx(next);
      setError(null);
    }
    setLoading(false);
  }, [rentalId, me]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED || !rentalId || !ctx) return;
    registerRentalDevContext({
      rentalId,
      pathname,
      source: 'rental_wizard',
      refresh,
      wizardCtx: ctx,
    });
    return () => unregisterRentalDevContext(rentalId);
  }, [ctx, pathname, refresh, rentalId]);

  if (loading) {
    return (
      <ScreenWrapper style={styles.center}>
        <ActivityIndicator color={ui.primary} />
      </ScreenWrapper>
    );
  }

  if (!ctx || error) {
    return (
      <ScreenWrapper style={styles.center}>
        <Text style={styles.error}>{error ?? 'Unable to load rental.'}</Text>
      </ScreenWrapper>
    );
  }

  return (
    <RentalWizardProvider ctx={ctx} onRefresh={refresh}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </RentalWizardProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { fontSize: 15, color: ui.textSecondary, textAlign: 'center' },
});
