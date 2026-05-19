import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RentalWizardProvider } from '@/components/rentalWizard/RentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import { buildRentalWizardContext } from '@/lib/rentalWizard';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { registerRentalDevContext, unregisterRentalDevContext } from '@/lib/rentalSimulation';
import { useRentalWizardRealtimeSync } from '@/lib/rentalLifecycle/useRentalWizardRealtimeSync';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  createLifecyclePromptGateState,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
  logWizardNotificationPrompt,
  registerWizardPickupPromptSession,
  unregisterWizardPickupPromptSession,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import { getSupabase } from '@/lib/supabase';
import { ui } from '@/constants/appUi';

function isOnCoordinatePickupPath(pathname: string): boolean {
  return pathname.includes('/s/coordinate-pickup') || pathname.includes('/coordinate-pickup');
}

export default function RentalWizardLayout() {
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const me = useAuthUserId();
  const [ctx, setCtx] = useState<RentalWizardContext | null>(null);
  const ctxRef = useRef<RentalWizardContext | null>(null);
  const lifecycleGateRef = useRef<WizardLifecyclePromptId | null>(null);
  const [lifecycleGate, setLifecycleGate] = useState<WizardLifecyclePromptGateState>(() =>
    createLifecyclePromptGateState(null)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearLifecyclePromptGate = useCallback(() => {
    lifecycleGateRef.current = null;
    setLifecycleGate(createLifecyclePromptGateState(null));
  }, []);

  const armLifecyclePrompt = useCallback(
    (id: WizardLifecyclePromptId) => {
      if (lifecycleGateRef.current === id) return;
      lifecycleGateRef.current = id;
      setLifecycleGate(createLifecyclePromptGateState(id));
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!rentalId || !me) return;

    logScenario('lifecycle', {
      event: 'refresh_start',
      rentalId,
      source: 'wizard_layout',
      hasPrevCtx: Boolean(ctxRef.current),
      lifecycleGateActive: lifecycleGateRef.current,
    });

    const supabase = getSupabase();
    const next = await buildRentalWizardContext(supabase, rentalId, me);

    if (!next) {
      setError('This rental is not available for the guided flow.');
      setCtx(null);
      ctxRef.current = null;
    } else {
      setCtx(next);
      ctxRef.current = next;
      setError(null);
      logScenario('lifecycle', {
        event: 'refresh_end',
        rentalId,
        source: 'wizard_layout',
        hasCtx: true,
        lifecycleGateActive: lifecycleGateRef.current,
      });
    }
    setLoading(false);
  }, [me, rentalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      logScenario('lifecycle', { event: 'focus_refresh', rentalId, source: 'wizard_layout' });
      void refresh();
    }, [refresh, rentalId])
  );

  useRentalWizardRealtimeSync(rentalId, refresh);

  useEffect(() => {
    if (!rentalId) return;
    registerWizardPickupPromptSession({
      rentalId,
      isOnCoordinatePickup: () => isOnCoordinatePickupPath(pathnameRef.current),
      getCtx: () => ctxRef.current,
      isGateActive: () => lifecycleGateRef.current != null,
      armPickupAcceptedPrompt: () => armLifecyclePrompt('pickup_coordination_accepted'),
    });
    return () => unregisterWizardPickupPromptSession(rentalId);
  }, [armLifecyclePrompt, rentalId]);

  useEffect(() => {
    lifecycleGateRef.current = null;
    setLifecycleGate(createLifecyclePromptGateState(null));
  }, [rentalId]);

  const simulatePickupAcceptedOverlay = useCallback(() => {
    if (!rentalId) return;
    armLifecyclePrompt('pickup_coordination_accepted');
    logWizardNotificationPrompt(rentalId, 'notification_prompt_armed', {
      source: 'dev_toolkit',
      promptId: 'pickup_coordination_accepted',
    });
  }, [armLifecyclePrompt, rentalId]);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED || !rentalId || !ctx) return;
    registerRentalDevContext({
      rentalId,
      pathname,
      source: 'rental_wizard',
      refresh,
      wizardCtx: ctx,
      simulatePickupAcceptedOverlay,
    });
    return () => unregisterRentalDevContext(rentalId);
  }, [ctx, pathname, refresh, rentalId, simulatePickupAcceptedOverlay]);

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
    <RentalWizardProvider
      ctx={ctx}
      onRefresh={refresh}
      lifecycleGate={lifecycleGate}
      onClearLifecyclePrompt={clearLifecyclePromptGate}
    >
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </RentalWizardProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { fontSize: 15, color: ui.textSecondary, textAlign: 'center' },
});
