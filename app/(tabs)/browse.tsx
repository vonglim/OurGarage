import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import { numberPadAccessoryProps } from '../components/NumberPadKeyboardAccessory';
import { formatHowDisplay } from '../lib/deliveryFormat';
import { formatDurationDisplay } from '../lib/durationFormat';
import { milesFromViewerToRequest } from '../lib/requestDistance';
import {
  getNumericTotalPrice,
  parseMoneyToNumber,
  sanitizeMoneyDigits,
  formatUsd,
} from '../lib/money';
import { addOffer } from '../store/offersStore';
import { getEffectiveRentalStatus, useRequestsStore } from '../store/requestsStore';
import type { ToolListing } from '../store/listingsStore';
import { useListingsStore } from '../store/listingsStore';
import { ui } from '@/constants/appUi';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lifetimeMsForWhen(when: string | null | undefined): number {
  if (when === 'Today') return 1 * MS_PER_DAY;
  if (when === 'This Weekend') return 3 * MS_PER_DAY;
  if (when === 'Flexible') return 7 * MS_PER_DAY;
  return 7 * MS_PER_DAY;
}

function isRequestExpired(req: {
  timestamp?: number | null;
  when?: string | null;
  expiresAt?: number | null;
}): boolean {
  const exp = req.expiresAt != null ? Number(req.expiresAt) : NaN;
  if (Number.isFinite(exp)) {
    return Date.now() >= exp;
  }
  if (req.timestamp == null) return true;
  return Date.now() >= req.timestamp + lifetimeMsForWhen(req.when);
}

function isRequestActiveForBrowse(req: unknown): boolean {
  if (!req || typeof req !== 'object') return false;
  const r = req as {
    matched?: boolean;
    timestamp?: number;
    when?: string | null;
    expiresAt?: number | null;
    status?: string | null;
  };
  if (r.status != null && r.status !== '' && r.status !== 'active') return false;
  if (isRequestExpired(r)) return false;
  return getEffectiveRentalStatus(r as Parameters<typeof getEffectiveRentalStatus>[0]) === 'pending';
}

function distanceSortKeyRequest(req: unknown): number {
  const mi = milesFromViewerToRequest(req as Parameters<typeof milesFromViewerToRequest>[0]);
  return mi != null && Number.isFinite(mi) ? mi : Number.POSITIVE_INFINITY;
}

function matchesSearchRequests(req: Record<string, unknown>, q: string): boolean {
  if (!q) return true;
  const hay = [
    req.toolName,
    req.description,
    req.location,
    req.when,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesSearchListings(item: ToolListing, q: string): boolean {
  if (!q) return true;
  const hay = [item.toolName, item.description, item.ownerName].join(' ').toLowerCase();
  return hay.includes(q);
}

export default function Browse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string | string[]; mode?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const [mode, setMode] = useState('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [offerTargetId, setOfferTargetId] = useState<number | null>(null);
  const [offerPriceDraft, setOfferPriceDraft] = useState('');
  const [offerToolDescription, setOfferToolDescription] = useState('');
  const [offerMessageDraft, setOfferMessageDraft] = useState('');
  const [offerPriceUnlocked, setOfferPriceUnlocked] = useState(false);
  const offerPriceInputRef = useRef<TextInput>(null);

  const listings = useListingsStore((s) => s.listings);
  const requests = useRequestsStore((state) => state.requests);

  useEffect(() => {
    console.log("Requests in browse:", requests.length);
  }, [requests]);

  useFocusEffect(
    useCallback(() => {
      const rawQ = params.query;
      const rawM = params.mode;
      const qParam = (Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '';
      const mParam = (Array.isArray(rawM) ? rawM[0] : rawM) ?? '';

      const hasQuery = qParam.trim() !== '';
      const hasMode = mParam === 'tools' || mParam === 'requests';

      if (hasQuery) setSearchQuery(qParam);
      if (hasMode) setMode(mParam);

      if (hasQuery || hasMode) {
        router.setParams({ query: '', mode: '' });
      }
    }, [params.query, params.mode, router])
  );

  const q = searchQuery.trim().toLowerCase();

  const { requestRows, requestEmpty } = useMemo(() => {
    if (mode !== 'requests') {
      return { requestRows: [] as Record<string, unknown>[], requestEmpty: '' };
    }
    const data = requests;
    const active = data.filter(isRequestActiveForBrowse);
    const filtered = q ? active.filter((r) => matchesSearchRequests(r, q)) : active;
    const sorted = [...filtered].sort(
      (a, b) => distanceSortKeyRequest(a) - distanceSortKeyRequest(b)
    );
    const empty =
      sorted.length === 0
        ? active.length === 0
          ? 'No open requests nearby right now.'
          : 'Nothing matches your search.'
        : '';
    return { requestRows: sorted, requestEmpty: empty };
  }, [mode, q, requests]);

  const { toolRows, toolEmpty } = useMemo(() => {
    const filtered = q ? listings.filter((l) => matchesSearchListings(l, q)) : [...listings];
    filtered.sort((a, b) => a.distance - b.distance);
    const empty =
      filtered.length === 0
        ? listings.length === 0
          ? 'No tools listed yet.'
          : 'Nothing matches your search.'
        : '';
    return { toolRows: filtered, toolEmpty: empty };
  }, [listings, q]);

  const closeOfferModal = () => {
    Keyboard.dismiss();
    setOfferTargetId(null);
    setOfferPriceDraft('');
    setOfferToolDescription('');
    setOfferMessageDraft('');
    setOfferPriceUnlocked(false);
  };

  const submitOffer = () => {
    const n = parseMoneyToNumber(offerPriceDraft);
    if (n == null || n < 0) {
      Alert.alert('Total price required', 'Enter your total price for this entire request.');
      return;
    }
    if (offerTargetId != null) {
      const toolDescription = offerToolDescription.trim();
      const message = offerMessageDraft.trim();
      addOffer(offerTargetId, {
        price: n,
        ...(toolDescription ? { toolDescription } : {}),
        ...(message ? { message } : {}),
      });
      closeOfferModal();
      Alert.alert('Offer sent');
    }
  };

  const openOfferForRequest = (req: Record<string, unknown>) => {
    const ts = req.timestamp as number | undefined;
    if (ts == null) return;
    const total = getNumericTotalPrice(req);
    setOfferPriceDraft(
      total != null && Number.isFinite(total) ? sanitizeMoneyDigits(String(total)) : ''
    );
    setOfferPriceUnlocked(false);
    setOfferTargetId(ts);
  };

  const searchPlaceholder =
    mode === 'requests' ? 'Search for what people need' : 'Search for tools to rent';

  return (
    <KeyboardDismissScreen style={styles.root}>
      <View style={styles.screenInner}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: 16 + insets.top, paddingBottom: fabBottomReserve },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>Browse</Text>

          <View style={styles.segment}>
            <Pressable
              onPress={() => setMode('requests')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'requests' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'requests' && styles.segmentLabelActive]}>
                Requests
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('tools')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'tools' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'tools' && styles.segmentLabelActive]}>
                Tools
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />

          {mode === 'requests' ? (
            requestRows.length === 0 ? (
              <Text style={styles.emptyText}>{requestEmpty}</Text>
            ) : (
              requestRows.map((req, idx) => {
                const ts = req.timestamp as number | undefined;
                const title = String(req.toolName ?? '').trim() || 'Request';
                const desc = String(req.description ?? '').trim();
                const distMi = milesFromViewerToRequest(req as never);
                const distLabel =
                  distMi != null && Number.isFinite(distMi)
                    ? `${(Math.round(distMi * 10) / 10).toFixed(1)} mi`
                    : 'Distance unknown';
                const price = getNumericTotalPrice(req);
                const priceLabel = price != null && Number.isFinite(price) ? formatUsd(price) : '—';
                const metaLine = `${distLabel} · ${priceLabel} · ${formatDurationDisplay(req as never)}`;

                return (
                  <View key={ts ?? idx} style={styles.card}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {metaLine}
                    </Text>
                    {desc ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {desc}
                      </Text>
                    ) : null}
                    <Text style={styles.cardHow} numberOfLines={2}>
                      {formatHowDisplay(req as never)}
                    </Text>
                    <Pressable
                      onPress={() => openOfferForRequest(req)}
                      style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                    >
                      <Text style={styles.primaryBtnText}>Send Offer</Text>
                    </Pressable>
                  </View>
                );
              })
            )
          ) : toolRows.length === 0 ? (
            <Text style={styles.emptyText}>{toolEmpty}</Text>
          ) : (
            toolRows.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.toolName}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.distance.toFixed(1)} mi · {formatUsd(item.price)} · {item.ownerName}
                </Text>
                <Text style={styles.cardSub} numberOfLines={2}>
                  {item.description}
                </Text>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/request-a-tool',
                      params: {
                        prefillToolName: item.toolName,
                        prefillPrice: String(item.price),
                      },
                    })
                  }
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                >
                  <Text style={styles.primaryBtnText}>Request This Tool</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        <Modal
          visible={offerTargetId != null}
          transparent
          animationType="fade"
          onRequestClose={closeOfferModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeOfferModal}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKb}
            >
              <Pressable
                style={[styles.modalCard, styles.modalCardScroll]}
                onPress={(e) => e.stopPropagation()}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text style={styles.modalSectionLabel}>Offer</Text>
                  <Text style={styles.modalTitle}>Your total for this request</Text>
                  <Text style={styles.modalLabel}>Offer amount</Text>
                  <View
                    style={[
                      styles.modalMoneyRow,
                      !offerPriceUnlocked && styles.modalMoneyRowLocked,
                    ]}
                  >
                    <Text style={styles.modalDollar}>$</Text>
                    <TextInput
                      ref={offerPriceInputRef}
                      placeholder="0"
                      placeholderTextColor="#888"
                      value={offerPriceDraft}
                      onChangeText={(t) => setOfferPriceDraft(sanitizeMoneyDigits(t))}
                      style={styles.modalMoneyInput}
                      keyboardType="decimal-pad"
                      editable={offerPriceUnlocked}
                      selectTextOnFocus={offerPriceUnlocked}
                      {...numberPadAccessoryProps()}
                      returnKeyType="done"
                      blurOnSubmit
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                  </View>
                  {!offerPriceUnlocked ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.modalChangeAmount,
                        pressed && styles.modalSecondaryPressed,
                      ]}
                      onPress={() => {
                        setOfferPriceUnlocked(true);
                        requestAnimationFrame(() => offerPriceInputRef.current?.focus());
                      }}
                    >
                      <Text style={styles.modalChangeAmountText}>Change Offer Amount</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.modalChangeAmountSpacer} />
                  )}
                  <Text style={styles.modalHelper}>
                    This is the total price for the full duration
                  </Text>
                  <Text style={styles.modalLabelOptional}>Add a message (optional)</Text>
                  <TextInput
                    value={offerMessageDraft}
                    onChangeText={setOfferMessageDraft}
                    placeholder="Introduce yourself or add context"
                    placeholderTextColor="#888"
                    style={styles.modalMessageInput}
                    multiline
                    maxLength={500}
                  />
                  <Text style={styles.modalLabelOptional}>Describe your tool (optional)</Text>
                  <TextInput
                    value={offerToolDescription}
                    onChangeText={setOfferToolDescription}
                    placeholder="Condition, accessories, etc."
                    placeholderTextColor="#888"
                    style={styles.modalDescInput}
                    multiline
                    maxLength={500}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalSendLarge,
                      pressed && styles.modalPrimaryPressed,
                    ]}
                    onPress={submitOffer}
                  >
                    <Text style={styles.modalSendLargeText}>Send Offer</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalCancelBelow,
                      pressed && styles.modalSecondaryPressed,
                    ]}
                    onPress={closeOfferModal}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                </ScrollView>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
        <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screenInner: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#ECECEC',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636366',
  },
  segmentLabelActive: {
    color: '#000',
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F9F9F9',
    marginBottom: 22,
  },
  emptyText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
    lineHeight: 22,
  },
  cardMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C43',
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 14,
    color: '#636366',
    lineHeight: 20,
    marginBottom: 14,
  },
  cardDesc: {
    fontSize: 14,
    color: '#636366',
    lineHeight: 20,
    marginBottom: 6,
  },
  cardHow: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 14,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    paddingVertical: 13,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalKb: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
  },
  modalCardScroll: {
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalMoneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    backgroundColor: '#F8F8F8',
    paddingLeft: 12,
    marginBottom: 8,
  },
  modalMoneyRowLocked: {
    backgroundColor: '#EFEFEF',
    borderColor: '#D8D8D8',
  },
  modalChangeAmount: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  modalChangeAmountSpacer: {
    height: 28,
    marginBottom: 10,
  },
  modalChangeAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalDollar: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginRight: 4,
  },
  modalMoneyInput: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 12,
    fontSize: 20,
    color: '#000',
  },
  modalHelper: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalLabelOptional: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 8,
  },
  modalMessageInput: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000',
    backgroundColor: '#FAFAFA',
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalDescInput: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000',
    backgroundColor: '#FAFAFA',
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  modalSendLarge: {
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalPrimaryPressed: {
    opacity: ui.pressOpacity,
  },
  modalSecondaryPressed: {
    opacity: ui.pressOpacity,
  },
  modalSendLargeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBelow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 16,
    color: ui.primary,
    fontWeight: '600',
  },
});
