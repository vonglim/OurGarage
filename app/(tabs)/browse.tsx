import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import {
  RequestListCardInner,
  requestListCardSurface,
} from '../components/RequestListCardInner';
import { milesFromViewerToRequest } from '../lib/requestDistance';
import { getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '../lib/money';
import { addOffer } from '../store/offersStore';
import { getRequests } from '../store/requestsStore';
import { ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SortOption = 'newest' | 'oldest' | 'distance';

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'distance', label: 'Distance' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lifetimeMsForWhen(when: string | null | undefined): number {
  if (when === 'Today') return 1 * MS_PER_DAY;
  if (when === 'This Weekend') return 3 * MS_PER_DAY;
  if (when === 'Flexible') return 7 * MS_PER_DAY;
  return 7 * MS_PER_DAY;
}

function isRequestExpired(req: { timestamp?: number | null; when?: string | null }): boolean {
  if (req.timestamp == null) return true;
  return Date.now() >= req.timestamp + lifetimeMsForWhen(req.when);
}

function sortRequests(list: any[], sort: SortOption): any[] {
  const copy = [...list];
  if (sort === 'newest') {
    copy.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  } else if (sort === 'oldest') {
    copy.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  } else {
    copy.sort((a, b) => {
      const da = milesFromViewerToRequest(a);
      const db = milesFromViewerToRequest(b);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    });
  }
  return copy;
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function Browse() {
  const insets = useSafeAreaInsets();
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [refreshToken, setRefreshToken] = useState(0);
  const [offerTargetId, setOfferTargetId] = useState<number | null>(null);
  const [offerPriceDraft, setOfferPriceDraft] = useState('');
  const [offerPriceUnlocked, setOfferPriceUnlocked] = useState(false);
  const offerPriceInputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((n) => n + 1);
    }, [])
  );

  const { visibleRequests, emptyMessage } = useMemo(() => {
    void refreshToken;
    const all = getRequests();
    const active = all.filter((r) => !isRequestExpired(r));
    const visible = sortRequests(active, sortOption);
    const emptyMessage =
      visible.length === 0 && all.length > 0
        ? 'No active requests right now.'
        : 'No requests yet. Add one from the Request tab.';
    return { visibleRequests: visible, emptyMessage };
  }, [sortOption, refreshToken]);

  const closeOfferModal = () => {
    setOfferTargetId(null);
    setOfferPriceDraft('');
    setOfferPriceUnlocked(false);
  };

  const submitOffer = () => {
    const n = parseMoneyToNumber(offerPriceDraft);
    if (n == null || n < 0) {
      Alert.alert(
        'Total price required',
        'Enter your total price for this entire request.'
      );
      return;
    }
    if (offerTargetId != null) {
      addOffer(offerTargetId, { price: n });
      closeOfferModal();
      Alert.alert('Offer sent');
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 24 + insets.top, paddingBottom: 40 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>Local Requests</Text>
        </View>

        <Text style={styles.sortLabel}>Sort by</Text>
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={({ pressed }) => [
                styles.sortChip,
                sortOption === key && styles.sortChipSelected,
                pressed && styles.sortChipPressed,
              ]}
              onPress={() => setSortOption(key)}
            >
              <Text
                style={[
                  styles.sortChipText,
                  sortOption === key && styles.sortChipTextSelected,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.listDivider} />

        <View style={styles.list}>
          {visibleRequests.length === 0 ? (
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          ) : (
            visibleRequests.map((req, idx) => (
              <View key={req.timestamp ?? idx} style={styles.cardWrap}>
                <View style={requestListCardSurface.card}>
                  <RequestListCardInner
                    req={req}
                    matched={!!req.matched}
                    timeAgoText={
                      req.timestamp != null ? getTimeAgo(req.timestamp) : null
                    }
                    offerAction={{
                      disabled: !!req.matched,
                      onPress: () => {
                        if (req.timestamp == null || req.matched) return;
                        const total = getNumericTotalPrice(req);
                        setOfferPriceDraft(
                          total != null && Number.isFinite(total)
                            ? sanitizeMoneyDigits(String(total))
                            : ''
                        );
                        setOfferPriceUnlocked(false);
                        setOfferTargetId(req.timestamp);
                      },
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
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
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
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
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingLeft: 24,
    paddingRight: 56,
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  listDivider: {
    height: 1,
    backgroundColor: ui.border,
    marginBottom: 24,
    marginTop: 4,
  },
  sortChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: ui.radiusChip,
    backgroundColor: '#EEEEEE',
    borderWidth: 1,
    borderColor: ui.border,
  },
  sortChipSelected: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  sortChipPressed: {
    opacity: ui.pressOpacity,
  },
  sortChipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  sortChipTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  list: {
    marginBottom: 8,
  },
  emptyText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  cardWrap: {
    marginBottom: 14,
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
    marginBottom: 20,
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
