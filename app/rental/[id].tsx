import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useAuthUserId } from '@/lib/authUser';
import { formatUsd } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';

type RentalRow = {
  id: string;
  request_id: string;
  offer_id: string;
  renter_user_id: string;
  owner_user_id: string;
  status: string | null;
  price: number | null;
  duration_type?: string | null;
  meetup_time?: string | null;
  return_time?: string | null;
  return_location?: string | null;
  pickup_datetime?: string | null;
  return_datetime?: string | null;
  meetup_location?: string | null;
  owner_confirmed?: boolean | null;
  renter_confirmed?: boolean | null;
  agreement_status?: 'pending' | 'confirmed' | string | null;
  confirmed_at?: string | null;
  proposal_version?: number | null;
  proposal_updated_at?: string | null;
  confirmed_by_owner?: boolean | null;
  confirmed_by_renter?: boolean | null;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Not set';
  return new Date(t).toLocaleString();
}

function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Not set';
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

const OWNER_PICKUP_ITEMS = [
  { id: 'op-verify-renter', label: 'Verify renter identity' },
  { id: 'op-show-working', label: 'Show item working' },
  { id: 'op-accessories', label: 'Confirm included accessories' },
  { id: 'op-photo', label: 'Photograph item condition' },
  { id: 'op-return-expect', label: 'Confirm return expectations' },
] as const;

const RENTER_PICKUP_ITEMS = [
  { id: 'rp-condition', label: 'Verify item condition' },
  { id: 'rp-accessories', label: 'Confirm accessories received' },
  { id: 'rp-test', label: 'Test basic functionality' },
  { id: 'rp-photos', label: 'Take pickup photos' },
  { id: 'rp-deadline', label: 'Confirm return deadline' },
] as const;

const OWNER_RETURN_ITEMS = [
  { id: 'or-condition', label: 'Verify item condition' },
  { id: 'or-accessories', label: 'Confirm all accessories returned' },
  { id: 'or-test', label: 'Test functionality' },
  { id: 'or-damage', label: 'Confirm no major damage' },
] as const;

const RENTER_RETURN_ITEMS = [
  { id: 'rr-accessories', label: 'Return all accessories' },
  { id: 'rr-clean', label: 'Clean/reset item' },
  { id: 'rr-inspected', label: 'Confirm owner inspected item' },
] as const;

type ChecklistMaps = { owner: Record<string, boolean>; renter: Record<string, boolean> };
type ChecklistItemDef = { id: string; label: string };

function emptyChecklistMaps(
  ownerItems: readonly { id: string }[],
  renterItems: readonly { id: string }[]
): ChecklistMaps {
  return {
    owner: Object.fromEntries(ownerItems.map((i) => [i.id, false])),
    renter: Object.fromEntries(renterItems.map((i) => [i.id, false])),
  };
}

function allItemsDone(items: readonly { id: string }[], done: Record<string, boolean>): boolean {
  return items.every((i) => done[i.id]);
}

function splitForTwoColumns<T>(items: readonly T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

const LAYOUT_TABLET_MIN = 600;
const CHECKLIST_TWO_COL_MIN = 768;

function ChecklistRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 90, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };
  return (
    <Pressable
      pressOpacityFeedback={false}
      onPress={() => {
        onToggle();
        pulse();
      }}
      style={({ pressed }) => [styles.checklistRow, pressed && { opacity: 0.92 }]}
    >
      <Animated.View style={[styles.checklistBox, checked && styles.checklistBoxChecked, { transform: [{ scale }] }]}>
        {checked ? <Text style={styles.checklistBoxMark}>✓</Text> : null}
      </Animated.View>
      <Text style={[styles.checklistLabel, checked && styles.checklistLabelChecked]}>{label}</Text>
    </Pressable>
  );
}

function PartyAckFeedback({
  ack,
  viewerRole,
}: {
  ack: { owner: boolean; renter: boolean };
  viewerRole: 'owner' | 'renter';
}) {
  const both = ack.owner && ack.renter;
  const meConfirmed = viewerRole === 'owner' ? ack.owner : ack.renter;
  if (both) {
    return (
      <View style={styles.ackBlock}>
        <Text style={styles.ackLine}>✓ Both parties confirmed</Text>
      </View>
    );
  }
  if (meConfirmed) {
    return (
      <View style={styles.ackBlock}>
        <Text style={styles.ackLine}>✓ You confirmed</Text>
        <Text style={styles.ackWaiting}>
          {viewerRole === 'owner' ? 'Waiting for renter...' : 'Waiting for owner...'}
        </Text>
      </View>
    );
  }
  return null;
}

export default function RentalScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const supabase = getSupabase();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTabletMargins = windowWidth >= LAYOUT_TABLET_MIN;
  const checklistTwoColumns = windowWidth >= CHECKLIST_TWO_COL_MIN;
  const scrollPadH = isTabletMargins ? ui.spaceSection : 14;
  const me = useAuthUserId();
  const rentalId = (firstParam(params.id) ?? '').trim();
  const [rental, setRental] = useState<RentalRow | null>(null);
  const [request, setRequest] = useState<any>(null);
  /** Local-only: pickup → active → return → completed */
  const [lifecyclePhase, setLifecyclePhase] = useState<'pickup' | 'active' | 'return' | 'completed'>('pickup');
  const [pickupChecklist, setPickupChecklist] = useState<ChecklistMaps>(() =>
    emptyChecklistMaps(OWNER_PICKUP_ITEMS, RENTER_PICKUP_ITEMS)
  );
  const [returnChecklist, setReturnChecklist] = useState<ChecklistMaps>(() =>
    emptyChecklistMaps(OWNER_RETURN_ITEMS, RENTER_RETURN_ITEMS)
  );
  /** Local simulation of two-party pickup/return confirmations */
  const [pickupAck, setPickupAck] = useState({ owner: false, renter: false });
  const [returnAck, setReturnAck] = useState({ owner: false, renter: false });

  useEffect(() => {
    setLifecyclePhase('pickup');
    setPickupChecklist(emptyChecklistMaps(OWNER_PICKUP_ITEMS, RENTER_PICKUP_ITEMS));
    setReturnChecklist(emptyChecklistMaps(OWNER_RETURN_ITEMS, RENTER_RETURN_ITEMS));
    setPickupAck({ owner: false, renter: false });
    setReturnAck({ owner: false, renter: false });
  }, [rentalId]);

  useEffect(() => {
    if (!rentalId) return;
    let cancelled = false;
    const load = async () => {
      const { data: rentalData } = await supabase
        .from('rentals')
        .select('*')
        .eq('id', rentalId)
        .single();
      if (cancelled || rentalData == null) return;
      const r = rentalData as RentalRow;
      setRental(r);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [rentalId, supabase]);

  useEffect(() => {
    if (!rental?.request_id) return;

    const fetchRequest = async () => {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('id', rental.request_id)
        .single();

      if (error) {
        console.error('REQUEST FETCH ERROR', error);
        return;
      }

      console.log('REQUEST FETCH SUCCESS', data);

      setRequest(data);
    };

    void fetchRequest();
  }, [rental?.request_id, supabase]);

  useEffect(() => {
    if (!rental) return;
    console.log('[DETAILS PAGE] rental agreement fields', {
      agreement_status: rental.agreement_status ?? null,
      owner_confirmed: rental.owner_confirmed ?? null,
      renter_confirmed: rental.renter_confirmed ?? null,
      confirmed_at: rental.confirmed_at ?? null,
    });
  }, [rental]);

  const requestTimestamp = useMemo(() => {
    const n = Number(request?.timestamp);
    return Number.isFinite(n) ? n : null;
  }, [request?.timestamp]);

  if (!rentalId) {
    return (
      <View style={styles.centered}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Invalid rental.</Text>
        </ScreenEntrance>
      </View>
    );
  }

  if (!rental) return null;
  const finalPrice =
    typeof rental.price === 'number'
      ? rental.price
      : typeof request?.accepted_price === 'number'
        ? request.accepted_price
        : typeof request?.acceptedPrice === 'number'
          ? request.acceptedPrice
          : 0;

  const ownerConfirmed =
    typeof rental.owner_confirmed === 'boolean'
      ? rental.owner_confirmed
      : typeof rental.confirmed_by_owner === 'boolean'
        ? rental.confirmed_by_owner
        : false;
  const renterConfirmed =
    typeof rental.renter_confirmed === 'boolean'
      ? rental.renter_confirmed
      : typeof rental.confirmed_by_renter === 'boolean'
        ? rental.confirmed_by_renter
        : false;
  const agreementStatus: 'pending' | 'confirmed' =
    rental.agreement_status === 'confirmed'
      ? 'confirmed'
      : rental.agreement_status === 'pending'
        ? 'pending'
        : ownerConfirmed && renterConfirmed
      ? 'confirmed'
      : 'pending';
  const relationshipSubtitle = 'Owner ↔ Renter';
  const viewerRole: 'owner' | 'renter' =
    me && me === rental.owner_user_id ? 'owner' : me && me === rental.renter_user_id ? 'renter' : 'renter';
  const pickupItems = viewerRole === 'owner' ? OWNER_PICKUP_ITEMS : RENTER_PICKUP_ITEMS;
  const returnItems = viewerRole === 'owner' ? OWNER_RETURN_ITEMS : RENTER_RETURN_ITEMS;
  const pickupDoneForRole = pickupChecklist[viewerRole];
  const returnDoneForRole = returnChecklist[viewerRole];
  const allPickupItemsDone = allItemsDone(pickupItems, pickupDoneForRole);
  const allReturnItemsDone = allItemsDone(returnItems, returnDoneForRole);
  const [pickupChecklistLeft, pickupChecklistRight] = splitForTwoColumns(
    pickupItems as readonly ChecklistItemDef[]
  );
  const [returnChecklistLeft, returnChecklistRight] = splitForTwoColumns(
    returnItems as readonly ChecklistItemDef[]
  );
  const progressSteps = [
    { key: 'matched', label: 'Match' },
    { key: 'agreement', label: 'Agree' },
    { key: 'pickup', label: 'Pickup' },
    { key: 'active', label: 'Active' },
    { key: 'return', label: 'Return' },
  ] as const;
  const currentStepIndex =
    lifecyclePhase === 'return'
      ? 4
      : lifecyclePhase === 'active'
        ? 3
        : agreementStatus === 'confirmed'
          ? 2
          : 1;

  const togglePickupItem = (id: string) => {
    setPickupChecklist((prev) => ({
      ...prev,
      [viewerRole]: { ...prev[viewerRole], [id]: !prev[viewerRole][id] },
    }));
  };

  const toggleReturnItem = (id: string) => {
    setReturnChecklist((prev) => ({
      ...prev,
      [viewerRole]: { ...prev[viewerRole], [id]: !prev[viewerRole][id] },
    }));
  };

  const onReportIssue = () => {
    Alert.alert('Report issue', 'In-app reporting is coming soon. For urgent issues, message your match from chat.');
  };

  const onConfirmPickup = () => {
    if (!allPickupItemsDone) return;
    Alert.alert('Confirm pickup', 'Have both you and your match confirmed pickup?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          setPickupAck((prev) => {
            const next = {
              owner: viewerRole === 'owner' ? true : prev.owner,
              renter: viewerRole === 'renter' ? true : prev.renter,
            };
            if (next.owner && next.renter) {
              queueMicrotask(() => setLifecyclePhase('active'));
            }
            return next;
          });
        },
      },
    ]);
  };

  const onStartReturn = () => {
    setLifecyclePhase('return');
  };

  const onConfirmReturn = () => {
    if (!allReturnItemsDone) return;
    Alert.alert('Confirm return', 'Have both you and your match completed the return?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          setReturnAck((prev) => {
            const next = {
              owner: viewerRole === 'owner' ? true : prev.owner,
              renter: viewerRole === 'renter' ? true : prev.renter,
            };
            if (next.owner && next.renter) {
              queueMicrotask(() => setLifecyclePhase('completed'));
            }
            return next;
          });
        },
      },
    ]);
  };

  const openRentalChat = () => {
    if (!rental.id) {
      console.warn('Missing rental id');
      return;
    }
    router.push({
      pathname: '/chat/[id]',
      params: { id: rental.id },
    });
  };

  const actionFooter = (
    <>
      <Pressable
        pressOpacityFeedback={false}
        haptic
        style={({ pressed }) => [styles.messageSecondaryBtn, pressed && { opacity: 0.88 }]}
        onPress={openRentalChat}
      >
        <Text style={styles.messageSecondaryBtnText}>Message</Text>
      </Pressable>
      <Pressable
        pressOpacityFeedback={false}
        style={({ pressed }) => [styles.reportTextHit, pressed && { opacity: 0.72 }]}
        onPress={onReportIssue}
      >
        <Text style={styles.reportTextBtn}>Report Issue</Text>
      </Pressable>
      <Pressable
        pressOpacityFeedback={false}
        style={({ pressed }) => [styles.backHomeHit, pressed && { opacity: 0.65 }]}
        onPress={() => router.replace('/(tabs)/home')}
      >
        <Text style={styles.backHomeText}>Back To Home</Text>
      </Pressable>
    </>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={ui.surfaceStriped} />
      <ScreenEntrance style={styles.entranceFlex}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: scrollPadH, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
        >
          <View style={styles.contentWrap}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.toolName}>{request?.title || 'Item'}</Text>
              <Text style={styles.headerSubtitle}>{relationshipSubtitle}</Text>
            </View>

            {lifecyclePhase === 'completed' ? (
              <View style={[styles.progressRow, styles.progressRowComplete]}>
                <Text style={styles.progressCompleteBanner}>✓ Transaction Complete</Text>
              </View>
            ) : (
              <View style={[styles.progressRow, !isTabletMargins && styles.progressRowPhone]}>
                {progressSteps.map((step, idx) => {
                  const isDone = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <View key={step.key} style={styles.progressStepWrap}>
                      <View style={styles.progressStepCell}>
                        <View style={styles.progressItem}>
                          <Text
                            style={[
                              styles.progressSymbol,
                              isDone
                                ? styles.progressDone
                                : isCurrent
                                  ? styles.progressSymbolActive
                                  : styles.progressFuture,
                              isCurrent ? styles.progressSymbolCurrent : null,
                            ]}
                          >
                            {isDone ? '✓' : isCurrent ? '●' : '○'}
                          </Text>
                          <Text
                            style={[
                              styles.progressLabel,
                              isDone
                                ? styles.progressDone
                                : isCurrent
                                  ? styles.progressLabelActive
                                  : styles.progressFuture,
                              isCurrent ? styles.progressLabelCurrent : null,
                            ]}
                          >
                            {step.label}
                          </Text>
                        </View>
                      </View>
                      {idx < progressSteps.length - 1 ? (
                        <View style={[styles.progressConnector, !isTabletMargins && styles.progressConnectorPhone]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={[styles.agreementCard, !isTabletMargins && styles.cardPadPhone]}>
              <View style={styles.agreementHeaderRow}>
                <Text style={[styles.cardSectionTitle, styles.agreementTitleInHeader]}>Meeting Details</Text>
                <View style={styles.agreementStatusInHeader}>
                  <Text style={styles.agreementStatusMetaText}>
                    {`${ownerConfirmed ? '✓' : '○'} Owner  ${renterConfirmed ? '✓' : '○'} Renter  · `}
                  </Text>
                  <View
                    style={[
                      styles.agreementStatusDot,
                      agreementStatus === 'confirmed' ? styles.agreementStatusDotOk : styles.agreementStatusDotWarn,
                    ]}
                  />
                  <Text style={styles.agreementStatusMetaText}>
                    {agreementStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={styles.agreementGridRow}>
                <View style={styles.agreementGridCell}>
                  <Text style={styles.metaLabel}>Meetup location</Text>
                  <Text style={styles.agreementLocationValue}>
                    {rental.meetup_location || rental.return_location || 'Not set'}
                  </Text>
                </View>
                <View style={styles.agreementGridCell}>
                  <Text style={styles.metaLabel}>Duration</Text>
                  <Text style={styles.agreementSecondaryValue}>
                    {request?.when || rental.duration_type || '—'}
                  </Text>
                </View>
              </View>
              <View style={styles.agreementGridRow}>
                <View style={styles.agreementGridCell}>
                  <Text style={styles.metaLabel}>Pickup</Text>
                  <Text style={styles.agreementDatetimeValue}>
                    {formatCompactDateTime(rental.pickup_datetime ?? rental.meetup_time)}
                  </Text>
                </View>
                <View style={styles.agreementGridCell} />
              </View>
              <View style={[styles.agreementGridRow, styles.agreementGridRowLast]}>
                <View style={styles.agreementGridCell}>
                  <Text style={styles.metaLabel}>Return</Text>
                  <Text style={styles.agreementDatetimeValue}>
                    {formatCompactDateTime(rental.return_datetime ?? rental.return_time)}
                  </Text>
                </View>
                <View style={[styles.agreementGridCell, styles.agreementGridCellTimestamp]}>
                  {rental.confirmed_at ? (
                    <Text style={styles.confirmedAtText}>Confirmed {formatDateTime(rental.confirmed_at)}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={[styles.detailsCard, !isTabletMargins && styles.cardPadPhone]}>
              <Text style={styles.cardSectionTitle}>Agreed Cost Breakdown</Text>
              <View style={styles.costGridRow}>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Final agreed price</Text>
                  <Text style={styles.valueEmphasis}>{formatUsd(finalPrice ?? 0)}</Text>
                </View>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Delivery method</Text>
                  <Text style={styles.valueStandard}>{request?.deliveryMethod || 'No delivery needed'}</Text>
                </View>
              </View>
              <View style={styles.costGridRow}>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Delivery fee</Text>
                  <Text style={styles.valueStandard}>—</Text>
                </View>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Protection plan</Text>
                  <Text style={styles.valueStandard}>—</Text>
                </View>
              </View>
              <View style={[styles.costGridRow, styles.costGridRowLast]}>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Security deposit</Text>
                  <Text style={styles.valueStandard}>—</Text>
                </View>
                <View style={styles.costGridCell}>
                  <Text style={styles.label}>Estimated item value</Text>
                  <Text style={styles.valueStandard}>—</Text>
                </View>
              </View>
            </View>

            {agreementStatus === 'confirmed' && lifecyclePhase === 'pickup' ? (
              <View style={[styles.checklistCard, !isTabletMargins && styles.cardPadPhone]}>
                <Text style={styles.cardSectionTitle}>Pickup Checklist</Text>
                <Text style={styles.checklistRoleLine}>
                  {viewerRole === 'owner' ? 'As owner' : 'As renter'}
                </Text>
                {checklistTwoColumns ? (
                  <View style={styles.checklistTwoColWrap}>
                    <View style={styles.checklistCol}>
                      {pickupChecklistLeft.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          label={item.label}
                          checked={Boolean(pickupDoneForRole[item.id])}
                          onToggle={() => togglePickupItem(item.id)}
                        />
                      ))}
                    </View>
                    <View style={styles.checklistCol}>
                      {pickupChecklistRight.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          label={item.label}
                          checked={Boolean(pickupDoneForRole[item.id])}
                          onToggle={() => togglePickupItem(item.id)}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  pickupItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      label={item.label}
                      checked={Boolean(pickupDoneForRole[item.id])}
                      onToggle={() => togglePickupItem(item.id)}
                    />
                  ))
                )}
              </View>
            ) : null}

            {lifecyclePhase === 'return' ? (
              <View style={[styles.checklistCard, !isTabletMargins && styles.cardPadPhone]}>
                <Text style={styles.cardSectionTitle}>Return Checklist</Text>
                <Text style={styles.checklistRoleLine}>
                  {viewerRole === 'owner' ? 'As owner' : 'As renter'}
                </Text>
                {checklistTwoColumns ? (
                  <View style={styles.checklistTwoColWrap}>
                    <View style={styles.checklistCol}>
                      {returnChecklistLeft.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          label={item.label}
                          checked={Boolean(returnDoneForRole[item.id])}
                          onToggle={() => toggleReturnItem(item.id)}
                        />
                      ))}
                    </View>
                    <View style={styles.checklistCol}>
                      {returnChecklistRight.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          label={item.label}
                          checked={Boolean(returnDoneForRole[item.id])}
                          onToggle={() => toggleReturnItem(item.id)}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  returnItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      label={item.label}
                      checked={Boolean(returnDoneForRole[item.id])}
                      onToggle={() => toggleReturnItem(item.id)}
                    />
                  ))
                )}
              </View>
            ) : null}

            <View style={[styles.actionsCard, !isTabletMargins && styles.cardPadPhone]}>
              {lifecyclePhase === 'completed' ? (
                <>
                  <View style={styles.successCard}>
                    <Text style={styles.successTitle}>Rental completed successfully</Text>
                    <Text style={styles.successBody}>Thank you for using OurGarage.</Text>
                  </View>
                  <Pressable
                    pressOpacityFeedback={false}
                    style={({ pressed }) => [styles.leaveReviewHit, pressed && { opacity: 0.72 }]}
                    onPress={() => Alert.alert('Leave review', 'Reviews are coming soon.')}
                  >
                    <Text style={styles.leaveReviewText}>Leave Review</Text>
                  </Pressable>
                </>
              ) : agreementStatus === 'confirmed' && lifecyclePhase === 'pickup' ? (
                <>
                  <Text style={styles.nextStepsBody}>
                    Complete your pickup checklist, then confirm when both parties are ready.
                  </Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    disabled={!allPickupItemsDone}
                    onPress={onConfirmPickup}
                    style={({ pressed }) => [
                      styles.startButton,
                      !allPickupItemsDone && styles.startButtonDisabled,
                      pressed && allPickupItemsDone && styles.startButtonPressed,
                    ]}
                  >
                    <Text style={styles.startButtonText}>Confirm Pickup</Text>
                  </Pressable>
                  <PartyAckFeedback ack={pickupAck} viewerRole={viewerRole} />
                </>
              ) : agreementStatus === 'confirmed' && lifecyclePhase === 'active' ? (
                <>
                  <Text style={styles.meetupCompletedLine}>Pickup completed</Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
                    onPress={onStartReturn}
                  >
                    <Text style={styles.startButtonText}>Start Return</Text>
                  </Pressable>
                </>
              ) : agreementStatus === 'confirmed' && lifecyclePhase === 'return' ? (
                <>
                  <Text style={styles.nextStepsBody}>
                    Complete your return checklist, then confirm when both parties are done.
                  </Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    disabled={!allReturnItemsDone}
                    onPress={onConfirmReturn}
                    style={({ pressed }) => [
                      styles.startButton,
                      !allReturnItemsDone && styles.startButtonDisabled,
                      pressed && allReturnItemsDone && styles.startButtonPressed,
                    ]}
                  >
                    <Text style={styles.startButtonText}>Confirm Return</Text>
                  </Pressable>
                  <PartyAckFeedback ack={returnAck} viewerRole={viewerRole} />
                </>
              ) : (
                <>
                  <Text style={styles.nextStepsBody}>Coordinate pickup or delivery with your match.</Text>
                  {requestTimestamp != null ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
                      onPress={() => {
                        router.push({
                          pathname: '/handoff-confirmation',
                          params: { requestId: String(requestTimestamp) },
                        });
                      }}
                    >
                      <Text style={styles.startButtonText}>Start Rental</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.rentalStartedNote}>Rental details loaded. Request timeline unavailable.</Text>
                  )}
                </>
              )}
              {actionFooter}
            </View>
          </View>
        </ScrollView>
      </ScreenEntrance>
    </View>
  );
}

const styles = StyleSheet.create({
  entranceFlex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: ui.surfaceStriped,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: ui.surfaceStriped,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  contentWrap: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: 6,
  },
  headerTextBlock: {
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 2,
  },
  progressRow: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusCard,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRowPhone: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  progressRowComplete: {
    justifyContent: 'center',
    paddingVertical: 9,
  },
  progressCompleteBanner: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.25,
  },
  progressStepWrap: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressStepCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: '100%',
  },
  progressConnector: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginHorizontal: 3,
  },
  progressConnectorPhone: {
    marginHorizontal: 0,
  },
  progressSymbol: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 11,
  },
  progressSymbolCurrent: {
    fontSize: 11,
    lineHeight: 12,
  },
  progressLabel: {
    fontSize: 8.5,
    fontWeight: '500',
    lineHeight: 10,
    textAlign: 'center',
  },
  progressLabelCurrent: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  progressDone: {
    color: 'rgba(235,242,255,0.92)',
  },
  progressSymbolActive: {
    color: '#5EE9A8',
  },
  progressLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  progressFuture: {
    color: 'rgba(223,231,245,0.58)',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: ui.surfaceStriped,
  },
  card: {
    width: '100%',
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: 14,
    ...shadowCard,
    elevation: 2,
  },
  toolName: {
    fontSize: 20,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'left',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: ui.textMuted,
    lineHeight: 17,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.12,
    marginBottom: 10,
  },
  cardPadPhone: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  agreementCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusCard,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 0,
    ...shadowCard,
    elevation: 2,
  },
  agreementHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  agreementTitleInHeader: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
  },
  agreementStatusInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '52%',
    gap: 3,
  },
  agreementStatusMetaText: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
    color: ui.textSecondary,
    letterSpacing: 0.1,
  },
  agreementStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  agreementStatusDotOk: {
    backgroundColor: '#22C55E',
  },
  agreementStatusDotWarn: {
    backgroundColor: '#EF4444',
  },
  agreementGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  agreementGridRowLast: {
    marginBottom: 0,
  },
  agreementGridCell: {
    flex: 1,
    minWidth: 0,
  },
  agreementGridCellTimestamp: {
    justifyContent: 'flex-end',
    paddingTop: 14,
  },
  agreementLocationValue: {
    marginTop: 3,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  agreementDatetimeValue: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  agreementSecondaryValue: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    color: ui.textPrimary,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  valueStandard: {
    fontSize: 14,
    lineHeight: 19,
    color: ui.textPrimary,
  },
  confirmedAtText: {
    fontSize: 10,
    color: ui.textSubtle,
    lineHeight: 13,
    textAlign: 'right',
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#FBFCFE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadowCard,
    elevation: 2,
  },
  costGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  costGridRowLast: {
    marginBottom: 0,
  },
  costGridCell: {
    flex: 1,
    minWidth: 0,
  },
  checklistCard: {
    width: '100%',
    backgroundColor: '#FBFCFE',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 0,
    ...shadowCard,
    elevation: 2,
  },
  checklistTwoColWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checklistCol: {
    flex: 1,
    minWidth: 0,
  },
  checklistRoleLine: {
    fontSize: 9,
    fontWeight: '600',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginTop: -4,
    marginBottom: 4,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    marginBottom: 1,
  },
  checklistBox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(26,43,74,0.28)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistBoxChecked: {
    borderColor: ui.primary,
    backgroundColor: ui.primary,
  },
  checklistBoxMark: {
    color: ui.primaryOn,
    fontSize: 11,
    fontWeight: '800',
  },
  checklistLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    color: ui.textPrimary,
    fontWeight: '500',
  },
  checklistLabelChecked: {
    color: ui.textMuted,
    textDecorationLine: 'line-through',
  },
  meetupCompletedLine: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textMuted,
    marginBottom: 6,
  },
  ackBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  ackLine: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textMuted,
    lineHeight: 14,
  },
  ackWaiting: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '500',
    color: ui.textSubtle,
    lineHeight: 14,
  },
  successCard: {
    width: '100%',
    backgroundColor: '#E9F6EE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,99,63,0.18)',
    marginBottom: 6,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E4D32',
    marginBottom: 4,
  },
  successBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#25633F',
  },
  row: {
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.28,
    marginBottom: 2,
    textAlign: 'left',
  },
  value: {
    fontSize: ui.fontPrice,
    color: ui.textPrimary,
    textAlign: 'left',
    lineHeight: 22,
  },
  valueEmphasis: {
    fontSize: 22,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'left',
    lineHeight: 26,
  },
  actionsCard: {
    width: '100%',
    backgroundColor: '#FBFCFE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...shadowCard,
    elevation: 2,
  },
  nextSteps: {
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: ui.border,
    alignItems: 'center',
  },
  nextStepsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  nextStepsBody: {
    fontSize: 12,
    color: ui.textMuted,
    textAlign: 'left',
    lineHeight: 17,
  },
  actionBullet: {
    fontSize: 11,
    color: ui.textMuted,
    lineHeight: 15,
  },
  messageSecondaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(26,43,74,0.38)',
    backgroundColor: '#FFFFFF',
  },
  messageSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.primary,
  },
  reportTextHit: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 2,
  },
  reportTextBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textMuted,
    textAlign: 'center',
  },
  backHomeHit: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 2,
  },
  backHomeText: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSubtle,
    textAlign: 'center',
  },
  leaveReviewHit: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  leaveReviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
  },
  startButton: {
    backgroundColor: ui.primary,
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 0,
    ...shadowKey,
  },
  startButtonPressed: {
    ...primarySolidPressed,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  rentalStartedNote: {
    fontSize: 13,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 22,
  },
});
