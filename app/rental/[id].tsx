import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useAuthUserId } from '@/lib/authUser';
import { formatUsd } from '@/lib/money';
import {
  RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE,
  uploadRentalEvidencePhoto,
} from '@/lib/rentalEvidenceUpload';
import {
  deriveDualConfirmation,
  ensureVerificationRows,
  fetchVerificationPhotos,
  fetchVerificationRows,
  mergeChecklistMapsFromRows,
  persistChecklistState,
  persistConfirmation,
  signedUrlForEvidencePath,
  type PartyRole,
  type RentalVerificationRow,
  type VerificationPhase,
} from '@/lib/rentalVerification';
import {
  debugRentalNoteInsertEligibility,
  fetchRentalNotes,
  insertRentalNote,
  logRentalNotesTableHealthInDev,
  subscribeRentalNotes,
  type RentalNoteRole,
  type RentalNoteRow,
} from '@/lib/rentalNotes';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseProjectUrl } from '@/lib/supabase';
import { useCameraSessionStore } from '@/store/cameraSessionStore';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';
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
  owner_pickup_ready?: boolean | null;
  renter_pickup_ready?: boolean | null;
  owner_return_ready?: boolean | null;
  renter_return_ready?: boolean | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  handoff_approval_started_at?: string | null;
  signed_at?: string | null;
  signed_name?: string | null;
  agreement_version?: number | null;
  preauth_status?: 'not_started' | 'pending' | 'authorized' | 'failed' | 'released' | string | null;
  preauth_amount?: number | null;
  preauth_authorized_at?: string | null;
  daily_late_fee?: number | null;
  grace_period_hours?: number | null;
  replacement_value?: number | null;
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
  { id: 'op-verify-identity', label: 'Verify renter identity' },
  { id: 'op-review-photos', label: 'Review pickup photos' },
  { id: 'op-review-notes', label: 'Review pickup notes' },
] as const;

const RENTER_PICKUP_ITEMS = [
  { id: 'rp-review-photos', label: 'Review owner photos' },
  { id: 'rp-verify-condition', label: 'Verify item condition' },
  { id: 'rp-review-notes', label: 'Review owner notes' },
] as const;

const OWNER_RETURN_ITEMS = [
  { id: 'or-review-return', label: 'Review return condition' },
  { id: 'or-review-ret-notes', label: 'Review return notes' },
] as const;

const RENTER_RETURN_ITEMS = [
  { id: 'rr-upload-photos', label: 'Upload return photos' },
  { id: 'rr-document-wear', label: 'Document issues/wear' },
  { id: 'rr-confirm-accessories', label: 'Confirm accessories included' },
] as const;

type ChecklistMaps = { owner: Record<string, boolean>; renter: Record<string, boolean> };
type ChecklistItemDef = { id: string; label: string };
type PhotoDisplay = {
  id: string;
  uri: string;
  role?: PartyRole;
  phase?: VerificationPhase;
  userId?: string;
  createdAt?: string;
};

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

function fillDefaults(
  items: readonly { id: string }[],
  stored: Record<string, boolean>
): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const it of items) {
    o[it.id] = Boolean(stored[it.id]);
  }
  return o;
}

function splitForTwoColumns<T>(items: readonly T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

const LAYOUT_TABLET_MIN = 600;
const CHECKLIST_TWO_COL_MIN = 768;
const REQUIRED_PICKUP_PHOTOS = 3;
const REQUIRED_RETURN_PHOTOS = 3;

function normalizeRole(raw: unknown): PartyRole | undefined {
  const val = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (val === 'owner' || val === 'lender' || val === 'host') return 'owner';
  if (val === 'renter' || val === 'borrower' || val === 'guest') return 'renter';
  return undefined;
}

function normalizePhase(raw: unknown): VerificationPhase | undefined {
  const val = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (val === 'pickup' || val === 'pickup_handoff' || val === 'handoff') return 'pickup';
  if (val === 'return' || val === 'dropoff' || val === 'drop_off') return 'return';
  return undefined;
}

function ChecklistRow({
  label,
  checked,
  onToggle,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
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
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        onToggle();
        pulse();
      }}
      style={({ pressed }) => [styles.checklistRow, disabled && styles.checklistRowDisabled, pressed && { opacity: 0.92 }]}
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
          {viewerRole === 'owner' ? 'Waiting for renter confirmation…' : 'Waiting for owner confirmation…'}
        </Text>
      </View>
    );
  }
  return null;
}

function VerificationPhotosSubsection({
  photos,
  uploading,
  onAddPress,
  onPhotoPress,
}: {
  photos: { id: string; uri: string; role?: PartyRole; createdAt?: string }[];
  uploading: boolean;
  onAddPress: () => void;
  onPhotoPress: (index: number) => void;
}) {
  const slots = [0, 1, 2] as const;
  const extra = Math.max(0, photos.length - 3);
  return (
    <View style={styles.verificationSubsection}>
      <Text style={styles.verificationSubhead}>Photos</Text>
      <Text style={styles.verificationSubtext}>Evidence for this handoff</Text>
      <View style={styles.photoTileRow}>
        {slots.map((i) => {
          const p = photos[i];
          return p ? (
            <Pressable key={p.id} pressOpacityFeedback={false} onPress={() => onPhotoPress(i)}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} contentFit="cover" />
            </Pressable>
          ) : (
            <View key={`ph-${i}`} style={styles.photoTilePlaceholder}>
              <Text style={styles.photoTilePlaceholderGlyph}>◇</Text>
            </View>
          );
        })}
        <Pressable
          pressOpacityFeedback={false}
          disabled={uploading}
          style={({ pressed }) => [
            styles.photoTileAdd,
            (pressed || uploading) && { opacity: 0.85 },
            uploading && { opacity: 0.6 },
          ]}
          onPress={onAddPress}
        >
          <Text style={styles.photoTileAddText}>{uploading ? '…' : '+'}</Text>
          <Text style={styles.photoTileAddLabel}>{uploading ? 'Upload' : 'Add'}</Text>
        </Pressable>
      </View>
      {extra > 0 ? (
        <Text style={styles.photoExtraCount}>+{extra} more in this handoff</Text>
      ) : null}
    </View>
  );
}

function NoteItem({ note }: { note: RentalNoteRow }) {
  return (
    <View style={styles.noteItemRow}>
      <Text style={styles.noteBullet}>•</Text>
      <View style={styles.noteItemBody}>
        <Text style={styles.noteItemText}>{note.note}</Text>
        <Text style={styles.noteItemMeta}>
          {`${note.author_role === 'owner' ? 'Owner' : 'Renter'} · ${formatCompactDateTime(note.created_at)}`}
        </Text>
      </View>
    </View>
  );
}

function NoteList({ notes }: { notes: RentalNoteRow[] }) {
  if (notes.length === 0) {
    return <Text style={styles.notesEmptyText}>No notes yet.</Text>;
  }
  return (
    <View style={styles.noteList}>
      {notes.map((note) => (
        <NoteItem key={note.id} note={note} />
      ))}
    </View>
  );
}

function AddNoteInput({
  value,
  onChangeText,
  onAdd,
  disabled,
  disabledLabel,
  loading,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAdd: () => void;
  disabled: boolean;
  disabledLabel: string;
  loading: boolean;
  placeholder: string;
}) {
  return (
    <View style={styles.noteInputWrap}>
      <View style={styles.noteInputRow}>
        <TextInput
          style={[styles.noteInputInline, disabled && styles.noteInputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ui.textMuted}
          multiline={false}
          editable={!disabled}
          returnKeyType="done"
        />
        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={onAdd}
          disabled={disabled || loading || value.trim().length === 0}
          style={({ pressed }) => [
            styles.addNoteBtnInline,
            (disabled || loading || value.trim().length === 0) && styles.addNoteBtnDisabled,
            pressed && !disabled && value.trim().length > 0 && styles.startButtonPressed,
          ]}
        >
          <Text style={styles.addNoteBtnText}>{loading ? '…' : 'Add'}</Text>
        </Pressable>
      </View>
      {disabled ? <Text style={styles.noteLockLabel}>{disabledLabel}</Text> : null}
    </View>
  );
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
  const [pickupEvidenceDisplay, setPickupEvidenceDisplay] = useState<PhotoDisplay[]>([]);
  const [returnEvidenceDisplay, setReturnEvidenceDisplay] = useState<PhotoDisplay[]>([]);
  const [verificationRows, setVerificationRows] = useState<RentalVerificationRow[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [pickupExpanded, setPickupExpanded] = useState(true);
  const [returnExpanded, setReturnExpanded] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerPhase, setPhotoViewerPhase] = useState<VerificationPhase>('pickup');
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [agreementModalVisible, setAgreementModalVisible] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [rentalNotes, setRentalNotes] = useState<RentalNoteRow[]>([]);
  const [ownerNoteDraft, setOwnerNoteDraft] = useState('');
  const [renterNoteDraft, setRenterNoteDraft] = useState('');
  const [addingOwnerNote, setAddingOwnerNote] = useState(false);
  const [addingRenterNote, setAddingRenterNote] = useState(false);
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    setPickupEvidenceDisplay([]);
    setReturnEvidenceDisplay([]);
    setUploadingEvidence(false);
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

      setRequest(data);
    };

    void fetchRequest();
  }, [rental?.request_id, supabase]);

  const refreshVerificationState = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }
    const run = async () => {
      if (__DEV__) console.log('[verification refresh] start');
      if (!rentalId || !me) return;
      const { data: rentalData } = await supabase.from('rentals').select('*').eq('id', rentalId).single();
      if (!rentalData) return;
      const freshRental = { ...(rentalData as RentalRow) };
      setRental(freshRental);

      const ownerConfirmedRow =
        typeof freshRental.owner_confirmed === 'boolean'
          ? freshRental.owner_confirmed
          : typeof freshRental.confirmed_by_owner === 'boolean'
            ? freshRental.confirmed_by_owner
            : false;
      const renterConfirmedRow =
        typeof freshRental.renter_confirmed === 'boolean'
          ? freshRental.renter_confirmed
          : typeof freshRental.confirmed_by_renter === 'boolean'
            ? freshRental.confirmed_by_renter
            : false;
      const agr =
        freshRental.agreement_status === 'confirmed'
          ? true
          : freshRental.agreement_status === 'pending'
            ? false
            : ownerConfirmedRow && renterConfirmedRow;

      const freshRowsRaw = agr ? await fetchVerificationRows(supabase, rentalId) : [];
      const freshRows = freshRowsRaw.map((row) => ({
        ...row,
        checklist_state:
          row.checklist_state && typeof row.checklist_state === 'object'
            ? { ...(row.checklist_state as Record<string, boolean>) }
            : {},
      }));
      setVerificationRows([...freshRows]);

      const mergedP = mergeChecklistMapsFromRows(freshRows, 'pickup');
      setPickupChecklist({
        owner: fillDefaults(OWNER_PICKUP_ITEMS, mergedP.owner),
        renter: fillDefaults(RENTER_PICKUP_ITEMS, mergedP.renter),
      });
      const mergedR = mergeChecklistMapsFromRows(freshRows, 'return');
      setReturnChecklist({
        owner: fillDefaults(OWNER_RETURN_ITEMS, mergedR.owner),
        renter: fillDefaults(RENTER_RETURN_ITEMS, mergedR.renter),
      });
      const pAck = deriveDualConfirmation(freshRows, 'pickup');
      const rAck = deriveDualConfirmation(freshRows, 'return');
      setPickupAck({ ...pAck });
      setReturnAck({ ...rAck });
      const hasReturnRows = freshRows.some((r) => r.phase === 'return');
      if (rAck.owner && rAck.renter) setLifecyclePhase('completed');
      else if (hasReturnRows) setLifecyclePhase('return');
      else if (pAck.owner && pAck.renter) setLifecyclePhase('active');
      else setLifecyclePhase('pickup');

      const [pickupPhotosRaw, returnPhotosRaw] = await Promise.all([
        fetchVerificationPhotos(supabase, rentalId, 'pickup'),
        fetchVerificationPhotos(supabase, rentalId, 'return'),
      ]);
      const signList = async (list: Awaited<ReturnType<typeof fetchVerificationPhotos>>) => {
        const out: PhotoDisplay[] = [];
        for (const row of list) {
          const uri = await signedUrlForEvidencePath(supabase, row.storage_path);
          const role = normalizeRole(row.role);
          const phase = normalizePhase(row.phase);
          if (uri) {
            out.push({
              id: row.id,
              uri,
              role,
              phase,
              userId: row.uploaded_by,
              createdAt: row.created_at,
            });
          }
        }
        return out;
      };
      const [pickupPhotos, returnPhotos] = await Promise.all([signList(pickupPhotosRaw), signList(returnPhotosRaw)]);
      setPickupEvidenceDisplay([...pickupPhotos]);
      setReturnEvidenceDisplay([...returnPhotos]);
      if (__DEV__) {
        console.log('[verification refresh applied]', freshRows.length, pickupPhotos.length + returnPhotos.length, Date.now());
      }
      if (__DEV__) console.log('[verification refresh] end');
    };
    const task = run().finally(async () => {
      refreshInFlightRef.current = null;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        await refreshVerificationState();
      }
    });
    refreshInFlightRef.current = task;
    return task;
  }, [me, rentalId, supabase]);

  useEffect(() => {
    if (!rental?.id || !me) return;
    const currentRentalId = rental.id;

    void (async () => {
      await refreshVerificationState();
    })();

    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase
      .channel(`rental-verification-live:${currentRentalId}:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_verifications', filter: `rental_id=eq.${currentRentalId}` },
        async (payload) => {
          if (__DEV__) {
            console.log('[verification realtime]', 'rental_verifications', payload.eventType, payload.new);
          }
          await refreshVerificationState();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rental_verification_photos',
          filter: `rental_id=eq.${currentRentalId}`,
        },
        async (payload) => {
          if (__DEV__) {
            console.log('[verification realtime]', 'rental_verification_photos', payload.eventType, payload.new);
          }
          await refreshVerificationState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rentals', filter: `id=eq.${currentRentalId}` },
        async (payload) => {
          if (__DEV__) {
            console.log('[verification realtime]', 'rentals', payload.eventType, payload.new);
          }
          await refreshVerificationState();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    refreshVerificationState,
    rental?.id,
    me,
    supabase,
  ]);

  useEffect(() => {
    if (!rental?.id) return;
    let warnedMissingTable = false;
    let cancelled = false;
    const loadNotes = async () => {
      try {
        const rows = await fetchRentalNotes(supabase, rental.id);
        if (!cancelled) setRentalNotes(rows);
      } catch (e) {
        if (__DEV__ && !warnedMissingTable) {
          warnedMissingTable = true;
          const message = e instanceof Error ? e.message : String(e ?? 'unknown error');
          Alert.alert(
            'Rental notes backend missing',
            `rental_notes is not available in this Supabase project. Apply migration 031 and refresh schema cache.\n\nDetails: ${message}`
          );
        }
      }
    };
    void loadNotes();
    const unsubscribe = subscribeRentalNotes(supabase, rental.id, () => {
      void loadNotes();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [rental?.id, supabase]);

  useEffect(() => {
    void logRentalNotesTableHealthInDev(supabase);
  }, [supabase]);

  useEffect(() => {
    if (!__DEV__) return;
    const expected = 'https://sbipcsxlldfjbfdykict.supabase.co';
    const active = getSupabaseProjectUrl();
    if (active !== expected) {
      console.warn('[rentalNotes] active Supabase project mismatch', { expected, active });
    }
  }, []);

  useEffect(() => {
    const status = String(rental?.status ?? 'pending').trim().toLowerCase();
    const isAfterHandoff = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
      status
    );
    const isAfterReturn = ['returned', 'completed', 'cancelled'].includes(status);
    setPickupExpanded(!isAfterHandoff);
    setReturnExpanded(isAfterHandoff && !isAfterReturn);
  }, [rental?.status]);

  /** Same as listing / offers: multi-capture `/camera` session, then upload each frame to rental evidence. */
  useFocusEffect(
    useCallback(() => {
      if (!rental?.id || !rental.owner_user_id || !rental.renter_user_id || !me) return;

      const {
        capturedPhotoUris,
        setCapturedPhotoUris,
        rentalEvidenceSession,
        setRentalEvidenceSession,
      } = useCameraSessionStore.getState();

      const sess = rentalEvidenceSession;
      if (capturedPhotoUris.length === 0) {
        if (sess?.rentalId === rental.id) setRentalEvidenceSession(null);
        return;
      }

      if (!sess || sess.rentalId !== rental.id) {
        return;
      }

      const phase = sess.phase;
      const role: PartyRole =
        me === rental.owner_user_id ? 'owner' : me === rental.renter_user_id ? 'renter' : 'renter';

      setRentalEvidenceSession(null);
      const uris = [...capturedPhotoUris];
      setCapturedPhotoUris([]);

      void (async () => {
        setUploadingEvidence(true);
        await ensureVerificationRows(
          supabase,
          rental.id,
          rental.owner_user_id,
          rental.renter_user_id,
          phase
        );
        try {
          const failures: { index: number; detail: string; code?: string }[] = [];
          let successCount = 0;
          let photoIndex = 0;
          for (const uri of uris) {
            photoIndex += 1;
            if (!uri) continue;
            const res = await uploadRentalEvidencePhoto({
              client: supabase,
              rentalId: rental.id,
              phase,
              userId: me,
              role,
              localUri: uri,
            });
            if (!res.ok) {
              failures.push({
                index: photoIndex,
                detail: `${res.stage}: ${res.message}`,
                code: res.code,
              });
              continue;
            }
            successCount += 1;
            let signed = await signedUrlForEvidencePath(supabase, res.storagePath);
            if (!signed) {
              signed = await signedUrlForEvidencePath(supabase, res.storagePath);
            }
            const displayUri = signed ?? uri;
            if (!signed) {
              failures.push({
                index: photoIndex,
                detail: 'saved to cloud; preview link failed — try leaving and reopening this rental',
              });
            }
            const entry: PhotoDisplay = {
              id: res.dbRowId,
              uri: displayUri,
              role: normalizeRole(role),
              phase: normalizePhase(phase),
              userId: me,
              createdAt: new Date().toISOString(),
            };
            if (phase === 'pickup') {
              setPickupEvidenceDisplay((prev) => [...prev, entry]);
            } else {
              setReturnEvidenceDisplay((prev) => [...prev, entry]);
            }
          }
          if (failures.length > 0) {
            const allBucketMissing = failures.every((f) => f.code === 'bucket_missing');
            if (allBucketMissing) {
              Alert.alert('Rental evidence storage', RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE);
            } else {
              const lines = failures.map((f) => `• Photo ${f.index}: ${f.detail}`);
              const body = [...new Set(lines)].join('\n');
              Alert.alert('Some photos could not be saved', body);
            }
          }
          if (__DEV__) {
            if (failures.length > 0) {
              console.warn('[verification mutation] photo upload partial failure', {
                rentalId: rental.id,
                phase,
                successCount,
                failureCount: failures.length,
              });
            } else {
              console.log('[verification mutation] photo upload ok', { rentalId: rental.id, phase, successCount });
            }
          }
          await refreshVerificationState();
        } catch (error) {
          if (__DEV__) console.warn('[verification mutation] photo upload failed', { rentalId: rental.id, phase, error });
        } finally {
          setUploadingEvidence(false);
        }
      })();
    }, [me, refreshVerificationState, rental, supabase])
  );

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
  const threadUnread =
    typeof rental.offer_id === 'string' && rental.offer_id.trim() !== ''
      ? (unreadByOfferId[rental.offer_id.trim()] ?? 0)
      : 0;
  const rentalStatus = String(rental.status ?? 'pending').trim().toLowerCase();
  const handoffCompleted = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
    rentalStatus
  );
  const returnWorkflowEnabled = handoffCompleted;
  const returnCompleted = ['returned', 'completed', 'cancelled'].includes(rentalStatus);
  const ownerNotesLocked = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
    rentalStatus
  );
  const renterNotesEnabled = ['handed_off', 'active', 'return_pending'].includes(rentalStatus);
  const renterNotesLocked = ['returned', 'completed', 'cancelled'].includes(rentalStatus);
  const ownerInputDisabled = viewerRole !== 'owner' || ownerNotesLocked;
  const renterInputDisabled = viewerRole !== 'renter' || !renterNotesEnabled || renterNotesLocked;
  const ownerNotes = rentalNotes.filter((n) => n.author_role === 'owner');
  const renterNotes = rentalNotes.filter((n) => n.author_role === 'renter');
  const ownerPickupChecklistDone = allItemsDone(
    OWNER_PICKUP_ITEMS,
    fillDefaults(
      OWNER_PICKUP_ITEMS,
      verificationRows.find((r) => r.phase === 'pickup' && r.role === 'owner')?.checklist_state ?? {}
    )
  );
  const renterPickupChecklistDone = allItemsDone(
    RENTER_PICKUP_ITEMS,
    fillDefaults(
      RENTER_PICKUP_ITEMS,
      verificationRows.find((r) => r.phase === 'pickup' && r.role === 'renter')?.checklist_state ?? {}
    )
  );
  const ownerReturnChecklistDone = allItemsDone(
    OWNER_RETURN_ITEMS,
    fillDefaults(
      OWNER_RETURN_ITEMS,
      verificationRows.find((r) => r.phase === 'return' && r.role === 'owner')?.checklist_state ?? {}
    )
  );
  const renterReturnChecklistDone = allItemsDone(
    RENTER_RETURN_ITEMS,
    fillDefaults(
      RENTER_RETURN_ITEMS,
      verificationRows.find((r) => r.phase === 'return' && r.role === 'renter')?.checklist_state ?? {}
    )
  );
  const ownerPickupPhotos = pickupEvidenceDisplay.filter(
    (p) => normalizePhase(p.phase) === 'pickup' && normalizeRole(p.role) === 'owner'
  );
  const renterPickupPhotos = pickupEvidenceDisplay.filter(
    (p) => normalizePhase(p.phase) === 'pickup' && normalizeRole(p.role) === 'renter'
  );
  const renterReturnPhotos = returnEvidenceDisplay.filter(
    (p) => normalizePhase(p.phase) === 'return' && normalizeRole(p.role) === 'renter'
  );
  const ownerPickupPhotoRequirementMet = ownerPickupPhotos.length >= REQUIRED_PICKUP_PHOTOS;
  const renterReturnPhotoRequirementMet = renterReturnPhotos.length >= REQUIRED_RETURN_PHOTOS;
  const bilateralPickupReady = ownerPickupChecklistDone && ownerPickupPhotoRequirementMet && renterPickupChecklistDone;
  const returnReady = renterReturnChecklistDone && renterReturnPhotoRequirementMet && ownerReturnChecklistDone;
  const handoffApprovalStarted = Boolean(rental.handoff_approval_started_at || rental.handoff_approved_by_owner);
  const handoffApprovedByRenter = Boolean(rental.handoff_approved_by_renter);
  const canBeginHandoff =
    viewerRole === 'owner' &&
    bilateralPickupReady &&
    lifecyclePhase === 'pickup' &&
    !handoffApprovalStarted;
  const canRenterFinalizeHandoff =
    viewerRole === 'renter' &&
    lifecyclePhase === 'pickup' &&
    handoffApprovalStarted &&
    !handoffApprovedByRenter &&
    bilateralPickupReady;

  const openPhotoViewer = (phase: VerificationPhase, index: number) => {
    setPhotoViewerPhase(phase);
    setPhotoViewerIndex(index);
    setPhotoViewerVisible(true);
  };
  const viewerPhotos = photoViewerPhase === 'pickup' ? pickupEvidenceDisplay : returnEvidenceDisplay;
  const viewerPhoto = viewerPhotos[photoViewerIndex] ?? null;

  const addNote = async (role: RentalNoteRole, note: string) => {
    if (!me || !rental?.id) return;
    const phase = role === 'owner' ? 'pre_handoff' : 'active_rental';
    if (__DEV__) {
      const debugEval = await debugRentalNoteInsertEligibility(supabase, {
        rentalId: rental.id,
        authorId: me,
        authorRole: role,
        phase,
      });
      console.log('[rentalNotes] insert eligibility evaluation', {
        input: { rentalId: rental.id, authorId: me, authorRole: role, phase },
        debugEval,
      });
    }
    const { error } = await insertRentalNote(supabase, {
      rentalId: rental.id,
      authorId: me,
      authorRole: role,
      phase,
      note,
    });
    if (error) {
        if (__DEV__) {
          console.warn('[verification mutation] note insert failed', { rentalId: rental.id, role, phase, error });
        }
      Alert.alert('Could not add note', error);
      return;
    }
    if (__DEV__) {
      console.log('[verification mutation] note insert ok', { rentalId: rental.id, role, phase });
    }
    const rows = await fetchRentalNotes(supabase, rental.id);
    setRentalNotes(rows);
    await refreshVerificationState();
  };

  const onAddOwnerNote = async () => {
    if (ownerInputDisabled || ownerNoteDraft.trim() === '') return;
    setAddingOwnerNote(true);
    try {
      await addNote('owner', ownerNoteDraft);
      setOwnerNoteDraft('');
    } finally {
      setAddingOwnerNote(false);
    }
  };

  const onAddRenterNote = async () => {
    if (renterInputDisabled || renterNoteDraft.trim() === '') return;
    setAddingRenterNote(true);
    try {
      await addNote('renter', renterNoteDraft);
      setRenterNoteDraft('');
    } finally {
      setAddingRenterNote(false);
    }
  };

  const togglePickupItem = (id: string) => {
    if (!me) return;
    const nextMap = { ...pickupChecklist[viewerRole], [id]: !pickupChecklist[viewerRole][id] };
    void (async () => {
      try {
        await persistChecklistState(supabase, rental.id, 'pickup', me, nextMap);
        if (__DEV__) console.log('[verification mutation] pickup checklist update ok', { rentalId: rental.id, itemId: id });
        await refreshVerificationState();
      } catch (error) {
        if (__DEV__) console.warn('[verification mutation] pickup checklist update failed', { rentalId: rental.id, itemId: id, error });
      }
    })();
  };

  const toggleReturnItem = (id: string) => {
    if (!me) return;
    const nextMap = { ...returnChecklist[viewerRole], [id]: !returnChecklist[viewerRole][id] };
    void (async () => {
      try {
        await persistChecklistState(supabase, rental.id, 'return', me, nextMap);
        if (__DEV__) console.log('[verification mutation] return checklist update ok', { rentalId: rental.id, itemId: id });
        await refreshVerificationState();
      } catch (error) {
        if (__DEV__) console.warn('[verification mutation] return checklist update failed', { rentalId: rental.id, itemId: id, error });
      }
    })();
  };

  const persistReadinessFlags = async (overrides?: Partial<RentalRow>) => {
    const payload: Partial<RentalRow> = {
      owner_pickup_ready: ownerPickupChecklistDone && ownerPickupPhotoRequirementMet,
      renter_pickup_ready: renterPickupChecklistDone,
      owner_return_ready: ownerReturnChecklistDone,
      renter_return_ready: renterReturnChecklistDone && renterReturnPhotoRequirementMet,
      ...(overrides ?? {}),
    };
    const { data, error } = await supabase.from('rentals').update(payload).eq('id', rental.id).select('*').single();
    if (__DEV__) {
      if (error) console.warn('[verification mutation] readiness/status update failed', { rentalId: rental.id, payload, error });
      else console.log('[verification mutation] readiness/status update ok', { rentalId: rental.id, payload });
    }
    if (data) setRental(data as RentalRow);
    await refreshVerificationState();
  };

  const onReportIssue = () => {
    Alert.alert('Report issue', 'In-app reporting is coming soon. For urgent issues, message your match from chat.');
  };

  const onConfirmPickup = () => {
    if (!allPickupItemsDone || !me) return;
    Alert.alert(
      'Record pickup confirmation',
      'This records your side of pickup. The rental advances once both parties have confirmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await ensureVerificationRows(
              supabase,
              rental.id,
              rental.owner_user_id,
              rental.renter_user_id,
              'pickup'
            );
            const ok = await persistConfirmation(supabase, rental.id, 'pickup', me, true);
            if (!ok) {
              if (__DEV__) console.warn('[verification mutation] pickup confirmation failed', { rentalId: rental.id });
              Alert.alert('Could not save', 'Check your connection and try again.');
              return;
            }
            if (__DEV__) console.log('[verification mutation] pickup confirmation ok', { rentalId: rental.id });
            const rows = await fetchVerificationRows(supabase, rental.id);
            const ack = deriveDualConfirmation(rows, 'pickup');
            setPickupAck(ack);
            if (viewerRole === 'owner') {
              const { data: updatedRental } = await supabase
                .from('rentals')
                .update({ status: 'handed_off' })
                .eq('id', rental.id)
                .select('*')
                .single();
              if (__DEV__) console.log('[verification mutation] rental status update ok', { rentalId: rental.id, status: 'handed_off' });
              if (updatedRental) setRental(updatedRental as RentalRow);
              setLifecyclePhase('active');
            }
            if (ack.owner && ack.renter) {
              setLifecyclePhase('active');
            }
            await refreshVerificationState();
          },
        },
      ]
    );
  };

  const onBeginHandoffApproval = async () => {
    if (!me || viewerRole !== 'owner' || !canBeginHandoff) return;
    const replacementValue = typeof rental.replacement_value === 'number' ? rental.replacement_value : Math.max(finalPrice * 3, 150);
    const preauthAmount = Math.round(replacementValue * 0.5 * 100) / 100;
    await persistReadinessFlags({
      handoff_approved_by_owner: true,
      handoff_approval_started_at: new Date().toISOString(),
      replacement_value: replacementValue,
      preauth_amount: preauthAmount,
      preauth_status: 'pending',
      daily_late_fee: rental.daily_late_fee ?? Math.max(10, Math.round(finalPrice * 0.1)),
      grace_period_hours: rental.grace_period_hours ?? 2,
    });
  };

  const onRenterSignAndAuthorize = async () => {
    const signed = signatureName.trim();
    if (!signed || !me || viewerRole !== 'renter' || !canRenterFinalizeHandoff) return;
    await persistReadinessFlags({
      handoff_approved_by_renter: true,
      signed_name: signed,
      signed_at: new Date().toISOString(),
      agreement_version: Math.max(1, Number(rental.agreement_version ?? 1)),
      preauth_status: 'authorized',
      preauth_authorized_at: new Date().toISOString(),
      status: 'handed_off',
    });
    setAgreementModalVisible(false);
    setSignatureName('');
    setLifecyclePhase('active');
  };

  const onStartReturn = async () => {
    if (!me) return;
    await ensureVerificationRows(
      supabase,
      rental.id,
      rental.owner_user_id,
      rental.renter_user_id,
      'return'
    );
    const { data: updatedRental } = await supabase
      .from('rentals')
      .update({ status: 'return_pending' })
      .eq('id', rental.id)
      .select('*')
      .single();
    if (__DEV__) console.log('[verification mutation] rental status update ok', { rentalId: rental.id, status: 'return_pending' });
    if (updatedRental) setRental(updatedRental as RentalRow);
    setLifecyclePhase('return');
    await refreshVerificationState();
  };

  const onConfirmReturn = () => {
    if (!returnReady || !me || viewerRole !== 'owner') return;
    Alert.alert(
      'Record return confirmation',
      'This records your side of return. The rental completes once both parties have confirmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await ensureVerificationRows(
              supabase,
              rental.id,
              rental.owner_user_id,
              rental.renter_user_id,
              'return'
            );
            const ok = await persistConfirmation(supabase, rental.id, 'return', me, true);
            if (!ok) {
              if (__DEV__) console.warn('[verification mutation] return confirmation failed', { rentalId: rental.id });
              Alert.alert('Could not save', 'Check your connection and try again.');
              return;
            }
            if (__DEV__) console.log('[verification mutation] return confirmation ok', { rentalId: rental.id });
            const rows = await fetchVerificationRows(supabase, rental.id);
            const ack = deriveDualConfirmation(rows, 'return');
            setReturnAck(ack);
            if (viewerRole === 'owner') {
              const { data: updatedRental } = await supabase
                .from('rentals')
                .update({ status: 'returned' })
                .eq('id', rental.id)
                .select('*')
                .single();
              if (__DEV__) console.log('[verification mutation] rental status update ok', { rentalId: rental.id, status: 'returned' });
              if (updatedRental) setRental(updatedRental as RentalRow);
              setLifecyclePhase('completed');
            }
            if (ack.owner && ack.renter) {
              setLifecyclePhase('completed');
            }
            await refreshVerificationState();
          },
        },
      ]
    );
  };

  const openEvidenceCamera = (phase: VerificationPhase) => {
    if (!me) return;
    if (Platform.OS === 'web') {
      Alert.alert(
        'Camera',
        'Pickup and return verification photos must be taken live in the OurGarage mobile app.'
      );
      return;
    }
    const st = useCameraSessionStore.getState();
    st.setCapturedPhotoUris([]);
    st.setRentalEvidenceSession({ rentalId: rental.id, phase });
    router.push('/camera');
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
        {threadUnread > 0 ? (
          <View style={styles.threadMessageBadge}>
            <Text style={styles.threadMessageBadgeText}>{threadUnread > 99 ? '99+' : String(threadUnread)}</Text>
          </View>
        ) : null}
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

            {agreementStatus === 'confirmed' ? (
              <View style={[styles.checklistCard, !isTabletMargins && styles.cardPadPhone]}>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => setPickupExpanded((v) => !v)}
                  style={({ pressed }) => [styles.verificationTitleRow, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.verificationSectionTitle}>Pickup / Handoff Details</Text>
                  <Text style={styles.inlineRoleLabel}>{pickupExpanded ? 'Collapse' : 'View'}</Text>
                </Pressable>
                {!pickupExpanded ? (
                  <>
                    <Text style={styles.verificationCollapsedLine}>✓ Pickup workflow complete</Text>
                    <Text style={styles.verificationCollapsedMeta}>
                      {pickupEvidenceDisplay.length > 0
                        ? `· ${pickupEvidenceDisplay.length} photo${pickupEvidenceDisplay.length === 1 ? '' : 's'} documented`
                        : '· No photos uploaded yet'}
                    </Text>
                    <Text style={styles.verificationCollapsedMeta}>· Owner notes locked</Text>
                  </>
                ) : (
                  <>
                    <VerificationPhotosSubsection
                      photos={pickupEvidenceDisplay}
                      uploading={uploadingEvidence}
                      onAddPress={() => openEvidenceCamera('pickup')}
                      onPhotoPress={(idx) => openPhotoViewer('pickup', idx)}
                    />
                    <View style={styles.verificationSubheadRow}>
                      <Text style={[styles.verificationSubhead, styles.verificationSubheadSpaced]}>Your responsibilities</Text>
                      <Pressable
                        pressOpacityFeedback={false}
                        disabled={handoffCompleted}
                        onPress={() => {
                          const allTrue = Object.fromEntries(pickupItems.map((item) => [item.id, true]));
                          if (!me) return;
                          void (async () => {
                            try {
                              await persistChecklistState(supabase, rental.id, 'pickup', me, allTrue);
                              if (__DEV__) console.log('[verification mutation] pickup mark-all ok', { rentalId: rental.id });
                              await refreshVerificationState();
                            } catch (error) {
                              if (__DEV__) console.warn('[verification mutation] pickup mark-all failed', { rentalId: rental.id, error });
                            }
                          })();
                        }}
                      >
                        <Text style={[styles.markAllText, handoffCompleted && styles.markAllTextDisabled]}>Mark All Complete</Text>
                      </Pressable>
                    </View>
                    {checklistTwoColumns ? (
                      <View style={styles.checklistTwoColWrap}>
                        <View style={styles.checklistCol}>
                          {pickupChecklistLeft.map((item) => (
                            <ChecklistRow
                              key={item.id}
                              label={item.label}
                              checked={Boolean(pickupDoneForRole[item.id])}
                              onToggle={() => togglePickupItem(item.id)}
                              disabled={handoffCompleted}
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
                              disabled={handoffCompleted}
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
                          disabled={handoffCompleted}
                        />
                      ))
                    )}
                    <View style={styles.notesGroup}>
                      <Text style={styles.notesGroupTitle}>Owner Notes</Text>
                      <NoteList notes={ownerNotes} />
                      <AddNoteInput
                        value={ownerNoteDraft}
                        onChangeText={setOwnerNoteDraft}
                        onAdd={onAddOwnerNote}
                        disabled={ownerInputDisabled}
                        disabledLabel="Owner Notes Locked 🔒"
                        loading={addingOwnerNote}
                        placeholder="Add owner note before handoff…"
                      />
                    </View>
                  </>
                )}
              </View>
            ) : null}

            {agreementStatus === 'confirmed' && lifecyclePhase === 'active' ? (
              <View style={[styles.prepareForReturnCard, !isTabletMargins && styles.cardPadPhone]}>
                <Text style={styles.prepareForReturnTitle}>Prepare for Return</Text>
                <View style={styles.prepareForReturnRow}>
                  <Text style={styles.metaLabel}>Return time</Text>
                  <Text style={styles.prepareForReturnValue}>
                    {formatCompactDateTime(rental.return_datetime ?? rental.return_time)}
                  </Text>
                </View>
                <View style={styles.prepareForReturnRow}>
                  <Text style={styles.metaLabel}>Return location</Text>
                  <Text style={styles.prepareForReturnValue}>
                    {rental.return_location || rental.meetup_location || 'Not set'}
                  </Text>
                </View>
                <Text style={styles.prepareForReturnRemindersHead}>Before return</Text>
                <Text style={styles.prepareReminderLine}>· Recharge battery if needed</Text>
                <Text style={styles.prepareReminderLine}>· Clean the item if your agreement expects it</Text>
                <Text style={styles.prepareReminderLine}>· Include all accessories</Text>
                <Text style={styles.prepareReminderLine}>· Plan return photos for the verification step</Text>
              </View>
            ) : null}

            <View
              style={[
                styles.checklistCard,
                !isTabletMargins && styles.cardPadPhone,
                !returnWorkflowEnabled && styles.phaseCardDisabled,
              ]}
            >
              <Pressable
                pressOpacityFeedback={false}
                disabled={!returnWorkflowEnabled}
                onPress={() => setReturnExpanded((v) => !v)}
                style={({ pressed }) => [styles.verificationTitleRow, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.verificationSectionTitle}>Return / Drop-off Details</Text>
                <Text style={styles.inlineRoleLabel}>
                  {!returnWorkflowEnabled ? 'Locked' : returnExpanded ? 'Collapse' : 'View'}
                </Text>
              </Pressable>
              {!returnWorkflowEnabled ? (
                <Text style={styles.verificationCollapsedMeta}>Available after handoff is confirmed.</Text>
              ) : !returnExpanded ? (
                <>
                  <Text style={styles.verificationCollapsedLine}>
                    {returnCompleted ? '✓ Return workflow complete' : 'Return workflow in progress'}
                  </Text>
                  <Text style={styles.verificationCollapsedMeta}>
                    {returnEvidenceDisplay.length > 0
                      ? `· ${returnEvidenceDisplay.length} photo${returnEvidenceDisplay.length === 1 ? '' : 's'} documented`
                      : '· No return photos uploaded yet'}
                  </Text>
                  <Text style={styles.verificationCollapsedMeta}>
                    {returnCompleted ? '· Renter notes locked' : '· Renter notes active'}
                  </Text>
                </>
              ) : (
                <>
                  <VerificationPhotosSubsection
                    photos={returnEvidenceDisplay}
                    uploading={uploadingEvidence}
                    onAddPress={() => openEvidenceCamera('return')}
                    onPhotoPress={(idx) => openPhotoViewer('return', idx)}
                  />
                  <View style={styles.verificationSubheadRow}>
                    <Text style={[styles.verificationSubhead, styles.verificationSubheadSpaced]}>Your responsibilities</Text>
                    <Pressable
                      pressOpacityFeedback={false}
                      disabled={!returnWorkflowEnabled || returnCompleted}
                      onPress={() => {
                        const allTrue = Object.fromEntries(returnItems.map((item) => [item.id, true]));
                        if (!me) return;
                        void (async () => {
                          try {
                            await persistChecklistState(supabase, rental.id, 'return', me, allTrue);
                            if (__DEV__) console.log('[verification mutation] return mark-all ok', { rentalId: rental.id });
                            await refreshVerificationState();
                          } catch (error) {
                            if (__DEV__) console.warn('[verification mutation] return mark-all failed', { rentalId: rental.id, error });
                          }
                        })();
                      }}
                    >
                      <Text style={[styles.markAllText, (!returnWorkflowEnabled || returnCompleted) && styles.markAllTextDisabled]}>
                        Mark All Complete
                      </Text>
                    </Pressable>
                  </View>
                  {checklistTwoColumns ? (
                    <View style={styles.checklistTwoColWrap}>
                      <View style={styles.checklistCol}>
                        {returnChecklistLeft.map((item) => (
                          <ChecklistRow
                            key={item.id}
                            label={item.label}
                            checked={Boolean(returnDoneForRole[item.id])}
                            onToggle={() => toggleReturnItem(item.id)}
                            disabled={!returnWorkflowEnabled || returnCompleted}
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
                            disabled={!returnWorkflowEnabled || returnCompleted}
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
                        disabled={!returnWorkflowEnabled || returnCompleted}
                      />
                    ))
                  )}
                  <View style={styles.notesGroup}>
                    <Text style={styles.notesGroupTitle}>Renter Notes</Text>
                    <NoteList notes={renterNotes} />
                    <AddNoteInput
                      value={renterNoteDraft}
                      onChangeText={setRenterNoteDraft}
                      onAdd={onAddRenterNote}
                      disabled={renterInputDisabled}
                      disabledLabel="Renter Notes Locked 🔒"
                      loading={addingRenterNote}
                      placeholder="Add renter note during active rental…"
                    />
                  </View>
                </>
              )}
            </View>

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
                    Both sides must complete pickup checklist + required photos before handoff approval.
                  </Text>
                  <Text style={styles.verificationCollapsedMeta}>
                    {bilateralPickupReady
                      ? 'Both sides ready for handoff.'
                      : ownerPickupChecklistDone && ownerPickupPhotoRequirementMet
                        ? 'Waiting for renter to finish verification steps.'
                        : renterPickupChecklistDone
                          ? 'Waiting for owner verification.'
                          : 'Both sides still need to complete verification.'}
                  </Text>
                  {__DEV__ ? (
                    <View style={styles.devReadinessBlock}>
                      <Text style={styles.devReadinessLine}>{`Owner checklist: ${ownerPickupChecklistDone ? '✅' : '❌'}`}</Text>
                      <Text style={styles.devReadinessLine}>{`Owner photos: ${ownerPickupPhotoRequirementMet ? '✅' : `❌ (${ownerPickupPhotos.length}/${REQUIRED_PICKUP_PHOTOS})`}`}</Text>
                      <Text style={styles.devReadinessLine}>{`Renter checklist: ${renterPickupChecklistDone ? '✅' : '❌'}`}</Text>
                      <Text style={styles.devReadinessLine}>{`Renter review complete: ${renterPickupChecklistDone ? '✅' : '❌'}`}</Text>
                      <Text style={styles.devReadinessLine}>{`Can begin handoff CTA: ${canBeginHandoff ? '✅' : '❌'}`}</Text>
                    </View>
                  ) : null}
                  {viewerRole === 'owner' ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      haptic
                      disabled={!canBeginHandoff}
                      onPress={onBeginHandoffApproval}
                      style={({ pressed }) => [
                        styles.startButton,
                        !canBeginHandoff && styles.startButtonDisabled,
                        pressed && canBeginHandoff && styles.startButtonPressed,
                      ]}
                    >
                      <Text style={styles.startButtonText}>Begin Handoff Approval</Text>
                    </Pressable>
                  ) : handoffApprovalStarted && !handoffApprovedByRenter ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      haptic
                      disabled={!canRenterFinalizeHandoff}
                      onPress={() => setAgreementModalVisible(true)}
                      style={({ pressed }) => [
                        styles.startButton,
                        !canRenterFinalizeHandoff && styles.startButtonDisabled,
                        pressed && canRenterFinalizeHandoff && styles.startButtonPressed,
                      ]}
                    >
                      <Text style={styles.startButtonText}>Review & Sign Agreement</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.verificationCollapsedMeta}>
                      {handoffApprovedByRenter ? 'Agreement signed and pre-authorization completed.' : 'Waiting for owner to begin handoff approval.'}
                    </Text>
                  )}
                  <PartyAckFeedback ack={pickupAck} viewerRole={viewerRole} />
                </>
              ) : agreementStatus === 'confirmed' && lifecyclePhase === 'active' ? (
                <>
                  <Text style={styles.meetupCompletedLine}>Pickup completed</Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
                    onPress={() => void onStartReturn()}
                  >
                    <Text style={styles.startButtonText}>Start Return</Text>
                  </Pressable>
                </>
              ) : agreementStatus === 'confirmed' && lifecyclePhase === 'return' ? (
                <>
                  <Text style={styles.nextStepsBody}>
                    Both sides must complete return checklist + required photos before owner confirms return.
                  </Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    disabled={!returnReady || viewerRole !== 'owner'}
                    onPress={onConfirmReturn}
                    style={({ pressed }) => [
                      styles.startButton,
                      (!returnReady || viewerRole !== 'owner') && styles.startButtonDisabled,
                      pressed && returnReady && viewerRole === 'owner' && styles.startButtonPressed,
                    ]}
                  >
                    <Text style={styles.startButtonText}>{viewerRole === 'owner' ? 'Confirm Return' : 'Waiting for owner confirmation'}</Text>
                  </Pressable>
                  <Text style={styles.verificationCollapsedMeta}>
                    {returnReady
                      ? 'Both sides ready for return confirmation.'
                      : ownerReturnChecklistDone
                        ? 'Waiting for renter return verification.'
                        : renterReturnChecklistDone && renterReturnPhotoRequirementMet
                          ? 'Waiting for owner return verification.'
                          : 'Both sides still need return verification.'}
                  </Text>
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

        <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewerVisible(false)}>
          <View style={styles.viewerBackdrop}>
            <View style={styles.viewerHeader}>
              <Pressable pressOpacityFeedback={false} onPress={() => setPhotoViewerVisible(false)}>
                <Text style={styles.viewerCloseText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.viewerBody}>
              <Pressable
                pressOpacityFeedback={false}
                disabled={photoViewerIndex <= 0}
                onPress={() => setPhotoViewerIndex((i) => Math.max(0, i - 1))}
              >
                <Text style={[styles.viewerNavText, photoViewerIndex <= 0 && styles.viewerNavTextDisabled]}>‹</Text>
              </Pressable>
              {viewerPhoto ? <Image source={{ uri: viewerPhoto.uri }} style={styles.viewerImage} contentFit="contain" /> : null}
              <Pressable
                pressOpacityFeedback={false}
                disabled={photoViewerIndex >= viewerPhotos.length - 1}
                onPress={() => setPhotoViewerIndex((i) => Math.min(viewerPhotos.length - 1, i + 1))}
              >
                <Text
                  style={[styles.viewerNavText, photoViewerIndex >= viewerPhotos.length - 1 && styles.viewerNavTextDisabled]}
                >
                  ›
                </Text>
              </Pressable>
            </View>
            {viewerPhoto ? (
              <Text style={styles.viewerMetaText}>
                {`${viewerPhoto.role === 'owner' ? 'Owner' : 'Renter'} · ${formatCompactDateTime(viewerPhoto.createdAt ?? null)}`}
              </Text>
            ) : null}
          </View>
        </Modal>

        <Modal visible={agreementModalVisible} transparent animationType="slide" onRequestClose={() => setAgreementModalVisible(false)}>
          <View style={styles.agreementModalBackdrop}>
            <View style={styles.agreementModalCard}>
              <Text style={styles.cardSectionTitle}>Rental Agreement</Text>
              <Text style={styles.verificationCollapsedMeta}>
                {`Replacement value: ${formatUsd(Number(rental.replacement_value ?? Math.max(finalPrice * 3, 150)))}`}
              </Text>
              <Text style={styles.verificationCollapsedMeta}>
                {`Pre-authorization hold: ${formatUsd(Number(rental.preauth_amount ?? Math.round(Math.max(finalPrice * 3, 150) * 0.5 * 100) / 100))}`}
              </Text>
              <Text style={styles.verificationCollapsedMeta}>
                {`Daily late fee: ${formatUsd(Number(rental.daily_late_fee ?? Math.max(10, Math.round(finalPrice * 0.1))))}`}
              </Text>
              <Text style={styles.verificationCollapsedMeta}>
                {`Grace period: ${Number(rental.grace_period_hours ?? 2)}h`}
              </Text>
              <TextInput
                style={styles.noteInputInline}
                value={signatureName}
                onChangeText={setSignatureName}
                placeholder="Type your full name to sign"
                placeholderTextColor={ui.textMuted}
              />
              <View style={styles.agreementModalActions}>
                <Pressable pressOpacityFeedback={false} onPress={() => setAgreementModalVisible(false)}>
                  <Text style={styles.reportTextBtn}>Cancel</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => void onRenterSignAndAuthorize()}
                  disabled={signatureName.trim().length === 0}
                  style={({ pressed }) => [
                    styles.startButton,
                    signatureName.trim().length === 0 && styles.startButtonDisabled,
                    pressed && signatureName.trim().length > 0 && styles.startButtonPressed,
                  ]}
                >
                  <Text style={styles.startButtonText}>Sign & Authorize</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  verificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  verificationSectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.12,
  },
  inlineRoleLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
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
  verificationSubsection: {
    marginTop: 10,
    marginBottom: 4,
  },
  verificationSubhead: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  verificationSubheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  markAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.primary,
  },
  markAllTextDisabled: {
    color: ui.textMuted,
  },
  verificationSubheadSpaced: {
    marginTop: 4,
  },
  verificationSubtext: {
    fontSize: 10,
    fontWeight: '500',
    color: ui.textMuted,
    lineHeight: 14,
    marginBottom: 8,
  },
  photoTileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  /** Matches `app/camera.tsx` strip / make-offer thumbs (60 × 60, 8 radius). */
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(26,43,74,0.14)',
    backgroundColor: '#1F2937',
  },
  photoTilePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(26,43,74,0.14)',
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTilePlaceholderGlyph: {
    fontSize: 16,
    color: ui.textMuted,
    opacity: 0.45,
  },
  photoTileAdd: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(11,31,58,0.28)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTileAddText: {
    fontSize: 22,
    fontWeight: '300',
    color: ui.primary,
    lineHeight: 24,
    marginTop: -2,
  },
  photoTileAddLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: 0.2,
    marginTop: -1,
  },
  photoExtraCount: {
    fontSize: 10,
    fontWeight: '500',
    color: ui.textMuted,
    marginTop: 4,
  },
  sharedNotesInput: {
    minHeight: 96,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    fontSize: 14,
    lineHeight: 20,
    color: ui.textPrimary,
  },
  notesCard: {
    width: '100%',
    backgroundColor: '#FBFCFE',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    ...shadowCard,
    elevation: 2,
  },
  notesGroup: {
    marginTop: 8,
  },
  notesGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 5,
  },
  noteList: {
    gap: 4,
  },
  notesEmptyText: {
    fontSize: 12,
    color: ui.textMuted,
    marginBottom: 4,
  },
  noteItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteBullet: {
    fontSize: 13,
    color: ui.textPrimary,
    marginTop: 1,
  },
  noteItemBody: {
    flex: 1,
    minWidth: 0,
  },
  noteItemText: {
    fontSize: 13,
    color: ui.textPrimary,
    lineHeight: 17,
  },
  noteItemMeta: {
    fontSize: 10,
    color: ui.textMuted,
    marginTop: 1,
  },
  noteInputWrap: {
    marginTop: 6,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteInputInline: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    fontSize: 13,
    lineHeight: 16,
    color: ui.textPrimary,
  },
  noteInputDisabled: {
    opacity: 0.7,
  },
  noteLockLabel: {
    marginTop: 5,
    fontSize: 11,
    color: ui.textMuted,
    fontWeight: '600',
  },
  addNoteBtnInline: {
    backgroundColor: ui.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  addNoteBtnDisabled: {
    opacity: 0.45,
  },
  addNoteBtnText: {
    color: ui.primaryOn,
    fontSize: 12,
    fontWeight: '700',
  },
  phaseCardDisabled: {
    backgroundColor: ui.surfaceInput,
    borderWidth: 1,
    borderColor: ui.border,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    paddingTop: 40,
    paddingHorizontal: 12,
    paddingBottom: 26,
    justifyContent: 'center',
  },
  viewerHeader: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
  },
  viewerCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  viewerImage: {
    flex: 1,
    height: 380,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  viewerNavText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  viewerNavTextDisabled: {
    opacity: 0.35,
  },
  viewerMetaText: {
    marginTop: 10,
    color: '#D7DDEA',
    fontSize: 12,
    textAlign: 'center',
  },
  agreementModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  agreementModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  agreementModalActions: {
    marginTop: 6,
    gap: 8,
  },
  devReadinessBlock: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF3FB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C9D7EE',
  },
  devReadinessLine: {
    fontSize: 11,
    color: ui.textSecondary,
    lineHeight: 15,
  },
  verificationCollapsedCard: {
    paddingVertical: 10,
  },
  verificationCollapsedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  verificationCollapsedTitle: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
  },
  verificationCollapsedBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#25633F',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  verificationCollapsedLine: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 18,
    marginTop: 4,
  },
  verificationCollapsedMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textMuted,
    lineHeight: 17,
    marginTop: 3,
  },
  prepareForReturnCard: {
    width: '100%',
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(11,31,58,0.06)',
    ...shadowCard,
    elevation: 1,
  },
  prepareForReturnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  prepareForReturnRow: {
    marginBottom: 8,
    gap: 2,
  },
  prepareForReturnValue: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 19,
  },
  prepareForReturnRemindersHead: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 10,
    fontWeight: '700',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  prepareReminderLine: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textMuted,
    lineHeight: 17,
    marginTop: 3,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    marginBottom: 1,
  },
  checklistRowDisabled: {
    opacity: 0.55,
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
    position: 'relative',
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
  threadMessageBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  threadMessageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
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
