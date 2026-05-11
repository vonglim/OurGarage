import { useFocusEffect } from '@react-navigation/native';
import type { PostgrestError } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { RentalEvidenceGalleryModal } from '@/components/RentalEvidenceGalleryModal';
import { RentalEvidenceThumbnail } from '@/components/RentalEvidenceThumbnail';
import { RentalWorkflowBanner } from '@/components/RentalWorkflowBanner';
import {
  RentalDetailsCard,
  type RentalDetailsCardHandle,
  type RentalMeetupDetails,
} from '@/components/RentalDetailsCard';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAwareScrollView';
import { BackHeader } from '@/components/AppHeaders';
import { RentalLifecycleNavigator } from '@/components/RentalLifecycleNavigator';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useAuthUserId } from '@/lib/authUser';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import {
  insertMeetupProposalOfferMessage,
} from '@/lib/meetupProposalThreadEvent';
import { formatNegotiatedDeliverySummary } from '@/lib/negotiationDelivery';
import { negotiatedDeliveryForOffer, type RequestPricingContext } from '@/lib/negotiationTermSnapshot';
import { formatUsd } from '@/lib/money';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import {
  DURATION_GRACE_HOURS,
  durationHoursBetween,
  evaluateDurationChange,
  resolveAgreementBaselineDurationHours,
} from '@/lib/proposalDurationChange';
import { isUuidString } from '@/lib/requestOwnership';
import { normalizeLegalName } from '@/lib/legalName';
import {
  DEV_TOOLS_ENABLED,
  mockAgreementSignatureName,
  mockOwnerPickupInstruction,
  mockRenterNoteParagraph,
  useDevPageAutofill,
} from '@/lib/devTools';
import { deriveLifecyclePhaseFromRentalStatus } from '@/lib/rentalLifecyclePhase';
import { insertRentalAgreementSnapshot } from '@/lib/rentalAgreement';
import {
  RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE,
  uploadRentalEvidencePhoto,
} from '@/lib/rentalEvidenceUpload';
import {
  isPhotoUploadWindowOpen,
  RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT,
} from '@/lib/rentalPhotoWindow';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';
import { deleteRentalEvidencePhoto } from '@/lib/deleteRentalEvidencePhoto';
import {
  bucketOwnerPickupPhotos,
  normalizePickupPhotoCategory,
  OWNER_ITEM_PHOTO_TARGET,
  OWNER_PICKUP_REQUIRED_ITEM_MIN,
  OWNER_PICKUP_REQUIRED_SERIAL_MIN,
  OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN,
  OWNER_SERIAL_PHOTO_TARGET,
  OWNER_TIMESTAMP_PROOF_TARGET,
  ownerPickupPhotoTargetsMet,
  type PickupPhotoCategory,
} from '@/lib/pickupVerificationPhotoBuckets';
import { computeRentalWorkflowBannerModel } from '@/lib/rentalWorkflowBannerModel';
import { mapSupabaseRequestSelectRowToApp } from '@/lib/supabaseRequests';
import {
  deriveDualConfirmation,
  ensureVerificationRows,
  fetchVerificationPhotos,
  fetchVerificationRows,
  mergeChecklistMapsFromRows,
  persistChecklistState,
  persistConfirmation,
  PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE,
  signedUrlForEvidencePath,
  type PartyRole,
  type RentalVerificationRow,
  type VerificationPhase,
} from '@/lib/rentalVerification';
import {
  deleteRentalNote,
  fetchRentalNotes,
  insertRentalNote,
  logRentalNotesTableHealthInDev,
  updateRentalNote,
  subscribeRentalNotes,
  type RentalNoteRole,
  type RentalNoteRow,
} from '@/lib/rentalNotes';
import {
  computeOwnerPickupEvidenceRevision,
  hydrateRenterPickupViewerFlagsFromEvidence,
  saveRenterPickupViewerFlags,
} from '@/lib/rentalPickupViewerFlags';
import { formatSupabaseMutationFailure } from '@/lib/supabaseSchemaMismatchMessage';
import { getSupabase } from '@/lib/supabase';
import { useDevToolsStore } from '@/store/devToolsStore';
import { getOfferById, useOffersStore } from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useCameraSessionStore } from '@/store/cameraSessionStore';
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
  last_proposed_by?: string | null;
  proposal_version?: number | null;
  proposal_updated_at?: string | null;
  latest_proposal_message_id?: string | null;
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
  max_late_fee_cap?: number | null;
  grace_period_hours?: number | null;
  replacement_value?: number | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
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

function formatCompactDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Not set';
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDurationDays(
  pickupIso: string | null | undefined,
  returnIso: string | null | undefined
): string | null {
  if (!pickupIso || !returnIso) return null;
  const pickupMs = Date.parse(pickupIso);
  const returnMs = Date.parse(returnIso);
  if (!Number.isFinite(pickupMs) || !Number.isFinite(returnMs) || returnMs <= pickupMs) return null;
  const days = Math.max(1, Math.ceil((returnMs - pickupMs) / 86_400_000));
  return `${days} day${days === 1 ? '' : 's'}`;
}

const DEFAULT_MEETUP_HOUR = 10;
const DEFAULT_MEETUP_MINUTE = 0;

function parseYyyyMmDdToLocalDateAt10Am(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo, d, DEFAULT_MEETUP_HOUR, DEFAULT_MEETUP_MINUTE, 0, 0);
}

function requestPickupReturnFallbackMs(req: unknown): { pickupMs: number | null; returnMs: number | null } {
  if (!req || typeof req !== 'object') return { pickupMs: null, returnMs: null };
  const r = req as Record<string, unknown>;
  const pRaw =
    (typeof r.pickupDate === 'string' && r.pickupDate.trim()) ||
    (typeof r.pickup_date === 'string' && r.pickup_date.trim()) ||
    '';
  const rRaw =
    (typeof r.returnDate === 'string' && r.returnDate.trim()) ||
    (typeof r.return_date === 'string' && r.return_date.trim()) ||
    '';
  const pd = pRaw ? parseYyyyMmDdToLocalDateAt10Am(pRaw) : null;
  const rd = rRaw ? parseYyyyMmDdToLocalDateAt10Am(rRaw) : null;
  return {
    pickupMs: pd ? pd.getTime() : null,
    returnMs: rd ? rd.getTime() : null,
  };
}

function formatAgreementMeetingPickupReturn(
  agreementConfirmed: boolean,
  rentalIso: string | null | undefined,
  fallbackMs: number | null
): string {
  if (rentalIso) {
    const t = Date.parse(rentalIso);
    if (Number.isFinite(t)) {
      if (agreementConfirmed) return formatCompactDate(rentalIso);
      return formatCompactDateTime(rentalIso);
    }
  }
  if (fallbackMs != null && Number.isFinite(fallbackMs)) {
    const d = new Date(fallbackMs);
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} • ${timePart}`;
  }
  return 'Not set';
}

const OWNER_PICKUP_ITEMS = [
  {
    id: 'op-upload-condition',
    label: 'Upload condition photos',
    required: true as const,
    control: 'auto' as const,
  },
  {
    id: 'op-upload-serial',
    label: 'Upload serial/model photo',
    required: true as const,
    control: 'auto' as const,
  },
  {
    id: 'op-upload-verification',
    label: 'Upload verification photo',
    required: true as const,
    control: 'auto' as const,
  },
  {
    id: 'op-accessories',
    label: 'Verify all included accessories are present',
    required: true as const,
    control: 'manual' as const,
  },
] as const;

const RENTER_PICKUP_ITEMS = [
  {
    id: 'rp-review-photos',
    label: 'Review owner photos',
    required: true as const,
    control: 'auto' as const,
  },
  { id: 'rp-serial-matches', label: 'Verify serial/model matches', required: true as const, control: 'manual' as const },
  { id: 'rp-verify-condition', label: 'Verify item condition', required: true as const, control: 'manual' as const },
  { id: 'rp-accessories', label: 'Confirm accessories are included', required: true as const, control: 'manual' as const },
  {
    id: 'rp-verify-note',
    label: 'Verify username and date on verification photo',
    required: true as const,
    control: 'auto' as const,
  },
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
type ChecklistItemDef = { id: string; label: string; required?: boolean; control?: 'manual' | 'auto' };
type PhotoDisplay = {
  id: string;
  path?: string;
  signedUrl?: string;
  role?: PartyRole;
  phase?: VerificationPhase;
  userId?: string;
  createdAt?: string;
  pickupPhotoCategory?: PickupPhotoCategory | null;
};

function buildOwnerPickupDoneEffective(
  storedManual: Record<string, boolean>,
  ownerPickupPhotos: PhotoDisplay[]
): Record<string, boolean> {
  const b = bucketOwnerPickupPhotos(ownerPickupPhotos);
  return {
    'op-upload-condition': b.item.length >= OWNER_PICKUP_REQUIRED_ITEM_MIN,
    'op-upload-serial': b.serial.length >= OWNER_PICKUP_REQUIRED_SERIAL_MIN,
    'op-upload-verification': b.timestampProof.length >= OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN,
    'op-accessories': Boolean(storedManual['op-accessories']),
  };
}

function buildRenterPickupDoneEffective(
  storedManual: Record<string, boolean>,
  viewFlags: { reviewedOwnerPhotos: boolean; viewedTimestampProof: boolean },
  pickupRenterConfirmed: boolean,
  handoffCompleted: boolean
): Record<string, boolean> {
  const freezeAuto = handoffCompleted || pickupRenterConfirmed;
  return {
    'rp-review-photos': freezeAuto || viewFlags.reviewedOwnerPhotos,
    'rp-serial-matches': Boolean(storedManual['rp-serial-matches']),
    'rp-verify-condition': Boolean(storedManual['rp-verify-condition']),
    'rp-accessories': Boolean(storedManual['rp-accessories']),
    'rp-verify-note': freezeAuto || viewFlags.viewedTimestampProof,
  };
}

function pickupAutoRowHelper(itemId: string, role: 'owner' | 'renter'): string | undefined {
  if (role === 'owner') {
    if (itemId === 'op-upload-verification') return "Include your username and today's date.";
    return 'Completed automatically when requirements are met.';
  }
  if (itemId === 'rp-review-photos') return 'Automatically checked when you view owner photos';
  if (itemId === 'rp-verify-note') return 'Automatically checked when you open the verification photo';
  return undefined;
}

const HANDOFF_ITEM_PREVIEW_MAX = 4;

function PickupHandoffItemPhotoRow({
  photos,
  openPickupPhotoById,
  canDeletePhoto,
  confirmDeletePhoto,
}: {
  photos: PhotoDisplay[];
  openPickupPhotoById: (id: string) => void;
  canDeletePhoto: (p: PhotoDisplay) => boolean;
  confirmDeletePhoto: (p: PhotoDisplay) => void;
}) {
  const overlayExtra = photos.length > HANDOFF_ITEM_PREVIEW_MAX ? photos.length - HANDOFF_ITEM_PREVIEW_MAX : 0;
  const visible = photos.slice(0, Math.min(HANDOFF_ITEM_PREVIEW_MAX, photos.length));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.handoffEvidenceGallery}
    >
      {visible.map((p, i) => {
        const showMore = overlayExtra > 0 && i === visible.length - 1;
        return (
          <View key={p.id} style={styles.handoffItemPreviewCell}>
            <RentalEvidenceThumbnail
              uri={p.signedUrl}
              size="handoffItem"
              category="item"
              canDelete={canDeletePhoto(p)}
              onPress={() => openPickupPhotoById(p.id)}
              onDelete={() => confirmDeletePhoto(p)}
            />
            {showMore ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => openPickupPhotoById(p.id)}
                style={styles.handoffItemMoreOverlay}
                accessibilityRole="button"
                accessibilityLabel={`${overlayExtra} more photos, open gallery`}
              >
                <Text style={styles.handoffItemMoreOverlayText}>+{overlayExtra}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function VerificationPhotoSectionHeader({ showTrustBadge }: { showTrustBadge: boolean }) {
  return (
    <View style={styles.handoffTimestampSectionHeading}>
      <View style={styles.handoffTimestampSectionTitleRow}>
        <View style={styles.handoffVerificationHeadingTitleCluster}>
          <Ionicons name="shield-checkmark" size={16} color="#166534" />
          <Text style={styles.handoffEvidenceGroupLabelHeading}>Verification Photo</Text>
        </View>
        {showTrustBadge ? (
          <View style={styles.handoffTimestampTrustPillWrap}>
            <View style={styles.handoffTimestampTrustPill}>
              <Ionicons name="shield-checkmark" size={11} color="#166534" />
              <Text style={styles.handoffTimestampTrustPillText}>Username + date</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

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

function allRequiredPickupItemsDone(
  items: readonly ChecklistItemDef[],
  done: Record<string, boolean>
): boolean {
  return items.filter((i) => i.required !== false).every((i) => Boolean(done[i.id]));
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

function stripPickupAutoFromStored(
  role: 'owner' | 'renter',
  stored: Record<string, boolean>
): Record<string, boolean> {
  const items = role === 'owner' ? OWNER_PICKUP_ITEMS : RENTER_PICKUP_ITEMS;
  const out = { ...stored };
  for (const it of items) {
    if (it.control === 'auto') delete out[it.id];
  }
  return out;
}

function manualPickupMapOnly(role: 'owner' | 'renter', map: Record<string, boolean>): Record<string, boolean> {
  const items = role === 'owner' ? OWNER_PICKUP_ITEMS : RENTER_PICKUP_ITEMS;
  const o: Record<string, boolean> = {};
  for (const it of items) {
    if (it.control !== 'auto') o[it.id] = Boolean(map[it.id]);
  }
  return o;
}

function splitForTwoColumns<T>(items: readonly T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function toBulletMultiline(text: string): string {
  if (text.trim().length === 0) return '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const normalized = lines.map((line, idx) => {
    const trimmed = line.replace(/^\s*[•\-]\s*/, '').trimStart();
    if (trimmed.length === 0) return idx === 0 ? '• ' : '• ';
    return `• ${trimmed}`;
  });
  return normalized.join('\n');
}

/** Normalize handoff link input: trim, prepend https:// if needed, validate http(s) URL. */
function normalizeHandoffUrl(raw: string): { ok: true; url: string } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: false };
  let candidate = t;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false };
    if (!u.hostname) return { ok: false };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false };
  }
}

function linkChipLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube Tutorial';
    if (path.endsWith('.pdf') || path.includes('.pdf?')) return 'Manual PDF';
    if (host.includes('notion.') || host.includes('docs.google.com') || host.includes('github.com'))
      return 'Setup Guide';
    const parts = host.split('.').filter((p) => p.length > 0);
    const base = parts[0];
    if (base && base.length > 1) return base.charAt(0).toUpperCase() + base.slice(1);
    return 'Open link';
  } catch {
    return 'Open link';
  }
}

function parseOwnerHandoffNoteContent(raw: string): { body: string; links: { url: string; label: string }[] } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const bodyLines: string[] = [];
  const links: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^\s*Link:\s*(\S+)\s*$/i);
    if (m) {
      const norm = normalizeHandoffUrl(m[1]);
      if (norm.ok && !seen.has(norm.url)) {
        seen.add(norm.url);
        links.push({ url: norm.url, label: linkChipLabelFromUrl(norm.url) });
      } else {
        bodyLines.push(line);
      }
      continue;
    }
    const t = line.trim();
    if (/^https?:\/\//i.test(t) && !/\s/.test(t)) {
      const norm = normalizeHandoffUrl(t);
      if (norm.ok && !seen.has(norm.url)) {
        seen.add(norm.url);
        links.push({ url: norm.url, label: linkChipLabelFromUrl(norm.url) });
      } else {
        bodyLines.push(line);
      }
      continue;
    }
    bodyLines.push(line);
  }
  return { body: bodyLines.join('\n').trim(), links };
}

/** Rebuild stored owner instruction text with one link removed; returns null if result would be empty. */
function rebuildOwnerHandoffNoteRemovingLink(raw: string, urlToRemove: string): string | null {
  const parsed = parseOwnerHandoffNoteContent(raw);
  const norm = normalizeHandoffUrl(urlToRemove.trim());
  const target = norm.ok ? norm.url : urlToRemove.trim();
  const links = parsed.links.filter((l) => l.url !== target);
  const parts: string[] = [];
  if (parsed.body.trim().length > 0) parts.push(parsed.body.trim());
  for (const l of links) {
    parts.push(`Link: ${l.url}`);
  }
  const out = parts.join('\n').trim();
  return out.length > 0 ? out : null;
}

function tryBuildOwnerInstructionCombined(
  noteDraft: string,
  linkDraft: string
): { ok: true; combined: string } | { ok: false } {
  const noteTrim = noteDraft.trim();
  const linkTrim = linkDraft.trim();
  const linkNorm = linkTrim ? normalizeHandoffUrl(linkTrim) : null;
  if (linkTrim && (!linkNorm || !linkNorm.ok)) return { ok: false };
  if (!noteTrim && !(linkNorm && linkNorm.ok)) return { ok: false };
  if (noteTrim && linkNorm && linkNorm.ok) return { ok: true, combined: `${noteTrim}\nLink: ${linkNorm.url}` };
  if (noteTrim) return { ok: true, combined: noteTrim };
  if (linkNorm && linkNorm.ok) return { ok: true, combined: `Link: ${linkNorm.url}` };
  return { ok: false };
}

const LAYOUT_TABLET_MIN = 600;
const CHECKLIST_TWO_COL_MIN = 768;
const REQUIRED_RETURN_PHOTOS = 3;

/** Signing modal — mockup-aligned accent (distinct from app nav primary). */
const AGREEMENT_SIGN_GREEN = '#15A34A';
const AGREEMENT_CARD_BG = '#F8F9FB';
const AGREEMENT_HOLD_TINT = '#EBF3FF';
const AGREEMENT_HEADING_SLATE = '#334155';

function AgreementModalKvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.agreementModalKvRow}>
      <Text style={styles.agreementModalKvLabel}>{label}</Text>
      <Text style={styles.agreementModalKvValue} numberOfLines={4}>
        {value}
      </Text>
    </View>
  );
}

function AgreementModalSecurityHoldInner({ preauthAmount }: { preauthAmount: number }) {
  return (
    <>
      <View style={styles.agreementModalSectionIconRow}>
        <Ionicons name="lock-closed-outline" size={20} color="#2563EB" />
        <Text style={styles.agreementModalSectionTitle}>Temporary Security Hold</Text>
      </View>
      <Text style={styles.agreementModalHoldSubtitle}>{`${formatUsd(preauthAmount)} temporary hold`}</Text>
      <View style={styles.agreementModalHoldBodyWrap}>
        <Text style={styles.agreementModalHoldBody}>This is a temporary hold, not an immediate charge.</Text>
        <Text style={styles.agreementModalHoldBody}>
          If approved after review, charges may apply for damage, non-return, or excessive late fees.
        </Text>
        <Text style={styles.agreementModalHoldBody}>
          Holds may expire automatically according to payment provider policies and timing.
        </Text>
      </View>
    </>
  );
}

const PICKUP_VERIFICATION_EXAMPLE = require('@/assets/images/pickup-verification-example.png');

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
  readOnly = false,
  onDisabledPress,
  helperText,
  light = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** System-driven row: no tap, muted label. */
  readOnly?: boolean;
  /** When set with `disabled`, row stays tappable and explains why toggling is blocked. */
  onDisabledPress?: () => void;
  helperText?: string;
  /** Lighter visual weight (e.g. renter pickup). */
  light?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 90, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };
  const pressableDisabled = readOnly;
  return (
    <Pressable
      pressOpacityFeedback={false}
      disabled={pressableDisabled}
      onPress={() => {
        if (readOnly) return;
        if (disabled) {
          onDisabledPress?.();
          return;
        }
        onToggle();
        pulse();
      }}
      style={({ pressed }) => [
        styles.checklistRow,
        light && styles.checklistRowLight,
        disabled && styles.checklistRowDisabled,
        readOnly && !disabled && styles.checklistRowReadOnly,
        pressed && !pressableDisabled && { opacity: 0.92 },
      ]}
    >
      <Animated.View
        style={[
          styles.checklistBox,
          light && styles.checklistBoxLight,
          checked && styles.checklistBoxChecked,
          readOnly && styles.checklistBoxReadOnly,
          { transform: [{ scale }] },
        ]}
      >
        {checked ? (
          <Text style={[styles.checklistBoxMark, light && styles.checklistBoxMarkLight]}>✓</Text>
        ) : null}
      </Animated.View>
      <View style={styles.checklistLabelBlock}>
        <Text
          style={[
            styles.checklistLabel,
            light && styles.checklistLabelLight,
            checked && styles.checklistLabelChecked,
            readOnly && styles.checklistLabelReadOnly,
          ]}
        >
          {label}
        </Text>
        {helperText ? (
          <Text style={[styles.checklistHelperMuted, light && styles.checklistHelperLight]}>
            {helperText}
          </Text>
        ) : null}
      </View>
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
  onDeletePhoto,
  canDeletePhoto,
  addDisabled,
  addDisabledReason,
}: {
  photos: {
    id: string;
    signedUrl?: string;
    role?: PartyRole;
    phase?: VerificationPhase;
    createdAt?: string;
    userId?: string;
  }[];
  uploading: boolean;
  onAddPress: () => void;
  onPhotoPress: (index: number) => void;
  onDeletePhoto: (photoId: string) => void;
  canDeletePhoto: (photo: { id: string; role?: PartyRole; phase?: VerificationPhase; userId?: string }) => boolean;
  addDisabled?: boolean;
  addDisabledReason?: string | null;
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
            <RentalEvidenceThumbnail
              key={p.id}
              uri={p.signedUrl}
              size="compact"
              category="return"
              canDelete={canDeletePhoto(p)}
              onPress={() => onPhotoPress(i)}
              onDelete={() => onDeletePhoto(p.id)}
            />
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
            (uploading || addDisabled) && { opacity: 0.6 },
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
      {addDisabledReason ? <Text style={styles.photoWindowHelper}>{addDisabledReason}</Text> : null}
    </View>
  );
}

type OwnerInstructionMenu = {
  onEdit: () => void;
  onDelete: () => void;
  linkChipMenu?: {
    onEditLink: (url: string) => void;
    onRemoveLink: (url: string) => void;
  };
};

function NoteItem({
  note,
  showLinkChips,
  instructionMenu,
}: {
  note: RentalNoteRow;
  showLinkChips?: boolean;
  instructionMenu?: OwnerInstructionMenu;
}) {
  const parsed = useMemo(() => {
    if (!showLinkChips || note.author_role !== 'owner') return null;
    return parseOwnerHandoffNoteContent(note.note);
  }, [showLinkChips, note.author_role, note.note]);

  const openInstructionMenu = () => {
    if (!instructionMenu) return;
    Alert.alert('Instruction', undefined, [
      { text: 'Edit', onPress: instructionMenu.onEdit },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete instruction?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: instructionMenu.onDelete },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openChip = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Cannot open link', 'This link cannot be opened on your device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link');
    }
  };

  if (parsed && (parsed.body.length > 0 || parsed.links.length > 0)) {
    return (
      <View style={styles.noteItemRow}>
        <Text style={styles.noteBullet}>•</Text>
        <View style={styles.noteItemBody}>
          {parsed.body.length > 0 ? <Text style={styles.noteItemText}>{parsed.body}</Text> : null}
          {parsed.links.length > 0 ? (
            <View style={styles.noteLinkChipsWrap}>
              {parsed.links.map((l, i) => (
                <Pressable
                  key={`${note.id}-link-${i}`}
                  pressOpacityFeedback={false}
                  onPress={() => void openChip(l.url)}
                  onLongPress={
                    instructionMenu?.linkChipMenu
                      ? () => {
                          const m = instructionMenu.linkChipMenu!;
                          Alert.alert(l.label, undefined, [
                            { text: 'Open link', onPress: () => void openChip(l.url) },
                            { text: 'Edit in form', onPress: () => m.onEditLink(l.url) },
                            {
                              text: 'Remove link',
                              style: 'destructive',
                              onPress: () => {
                                Alert.alert(
                                  'Remove link?',
                                  'The link will be removed from this instruction immediately.',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Remove',
                                      style: 'destructive',
                                      onPress: () => m.onRemoveLink(l.url),
                                    },
                                  ]
                                );
                              },
                            },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }
                      : undefined
                  }
                  delayLongPress={380}
                  style={({ pressed }) => [styles.noteLinkChip, pressed && { opacity: 0.88 }]}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${l.label}`}
                >
                  <Ionicons name="open-outline" size={15} color={ui.primary} />
                  <Text style={styles.noteLinkChipText} numberOfLines={1}>
                    {l.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.noteItemMeta}>
            {`${note.author_role === 'owner' ? 'Owner' : 'Renter'} · ${formatCompactDateTime(note.created_at)}`}
          </Text>
        </View>
        {instructionMenu ? (
          <Pressable
            pressOpacityFeedback={false}
            onPress={openInstructionMenu}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
            style={({ pressed }) => [styles.noteItemMenuHit, pressed && styles.noteItemMenuHitPressed]}
            accessibilityRole="button"
            accessibilityLabel="Instruction actions"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={ui.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.noteItemRow}>
      <Text style={styles.noteBullet}>•</Text>
      <View style={styles.noteItemBody}>
        <Text style={styles.noteItemText}>{note.note}</Text>
        <Text style={styles.noteItemMeta}>
          {`${note.author_role === 'owner' ? 'Owner' : 'Renter'} · ${formatCompactDateTime(note.created_at)}`}
        </Text>
      </View>
      {instructionMenu ? (
        <Pressable
          pressOpacityFeedback={false}
          onPress={openInstructionMenu}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
          style={({ pressed }) => [styles.noteItemMenuHit, pressed && styles.noteItemMenuHitPressed]}
          accessibilityRole="button"
          accessibilityLabel="Instruction actions"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={ui.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function NoteList({
  notes,
  emptyText,
  showLinkChips,
  instructionMenuForNote,
}: {
  notes: RentalNoteRow[];
  emptyText?: string;
  showLinkChips?: boolean;
  instructionMenuForNote?: (note: RentalNoteRow) => OwnerInstructionMenu | undefined;
}) {
  if (notes.length === 0) {
    return <Text style={styles.notesEmptyText}>{emptyText ?? 'No notes yet.'}</Text>;
  }
  return (
    <View style={styles.noteList}>
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          showLinkChips={showLinkChips}
          instructionMenu={instructionMenuForNote?.(note)}
        />
      ))}
    </View>
  );
}

function animateHandoffLayout() {
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, 'opacity'));
}

function HandoffOwnerNotesAccordion({
  expanded,
  onToggle,
  mode,
  title,
  helperCollapsed,
  childrenExpanded,
}: {
  expanded: boolean;
  onToggle: () => void;
  mode: 'owner' | 'renter';
  title: string;
  helperCollapsed: string;
  childrenExpanded: React.ReactNode;
}) {
  const rot = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rot, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [expanded, rot]);
  const chevronSpin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  return (
    <View
      style={[
        styles.handoffNotesAccordionCard,
        expanded && styles.handoffNotesAccordionCardExpanded,
        mode === 'renter' && styles.handoffNotesAccordionCardRenter,
      ]}
    >
      <Pressable
        pressOpacityFeedback={false}
        onPress={() => {
          animateHandoffLayout();
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.handoffNotesAccordionHeader,
          expanded && styles.handoffNotesAccordionHeaderExpanded,
          pressed && styles.handoffNotesAccordionHeaderPressed,
        ]}
      >
        <Ionicons name="document-text-outline" size={18} color={ui.textSecondary} />
        <View style={styles.handoffNotesAccordionTitleBlock}>
          <Text style={styles.handoffNotesAccordionTitle}>{title}</Text>
          <Text style={styles.handoffNotesAccordionHelper}>{helperCollapsed}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronSpin }] }}>
          <Ionicons name="chevron-forward" size={22} color="rgba(51, 65, 85, 0.88)" />
        </Animated.View>
      </Pressable>
      {expanded ? <View style={styles.handoffNotesAccordionBody}>{childrenExpanded}</View> : null}
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
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAdd: () => void;
  disabled: boolean;
  disabledLabel: string;
  loading: boolean;
  placeholder: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.noteInputWrap}>
      <View style={styles.noteInputRow}>
        <TextInput
          style={[styles.noteInputInline, disabled && styles.noteInputDisabled]}
          value={value}
          onChangeText={(text) => onChangeText(toBulletMultiline(text))}
          placeholder={placeholder}
          placeholderTextColor={ui.textMuted}
          multiline
          editable={!disabled}
          textAlignVertical="top"
          returnKeyType="default"
          maxLength={maxLength}
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const agreementModalLayout = useMemo(() => {
    const landscape = windowWidth > windowHeight;
    const isTablet = windowWidth >= LAYOUT_TABLET_MIN;
    const isTabletLandscape = isTablet && landscape;

    let backdropPadH: number;
    let backdropPadV: number;
    let cardWidth: number;
    let preferredHeight: number;
    let maxShellHeight: number;
    let shellMaxWidth: number | undefined;

    if (!isTablet) {
      backdropPadH = 8;
      backdropPadV = 10;
      cardWidth = windowWidth - backdropPadH * 2;
      preferredHeight = windowHeight - backdropPadV * 2;
      maxShellHeight = preferredHeight;
      shellMaxWidth = undefined;
    } else if (isTabletLandscape) {
      backdropPadH = Math.max(16, Math.round(windowWidth * 0.045));
      backdropPadV = Math.max(14, Math.round(windowHeight * 0.065));
      cardWidth = windowWidth * 0.9;
      preferredHeight = windowHeight * 0.87;
      maxShellHeight = windowHeight * 0.9;
      shellMaxWidth = windowWidth >= 1200 ? 1000 : undefined;
    } else {
      backdropPadH = Math.max(16, Math.round(windowWidth * 0.05));
      backdropPadV = Math.max(16, Math.round(windowHeight * 0.06));
      cardWidth = windowWidth * 0.9;
      preferredHeight = windowHeight * 0.88;
      maxShellHeight = windowHeight * 0.9;
      shellMaxWidth = windowWidth >= 1200 ? 1000 : undefined;
    }

    if (shellMaxWidth != null) {
      cardWidth = Math.min(cardWidth, shellMaxWidth);
    }

    const shellHeight = Math.min(preferredHeight, maxShellHeight);
    const threeCol = windowWidth >= 900 && landscape;
    const twoCol = windowWidth >= 600 && !threeCol;

    return {
      cardWidth,
      shellHeight,
      maxShellHeight,
      backdropPadH,
      backdropPadV,
      shellMaxWidth,
      isTablet,
      threeCol,
      twoCol,
      landscape,
    };
  }, [windowWidth, windowHeight]);
  const isTabletMargins = windowWidth >= LAYOUT_TABLET_MIN;
  const checklistTwoColumns = windowWidth >= CHECKLIST_TWO_COL_MIN;
  const scrollPadH = isTabletMargins ? ui.spaceSection : 14;
  const me = useAuthUserId();
  const rentalId = (firstParam(params.id) ?? '').trim();
  const [rental, setRental] = useState<RentalRow | null>(null);
  const [request, setRequest] = useState<any>(null);
  /** Section Y offsets inside scroll content (for lifecycle navigator). */
  const lifecycleSectionYRef = useRef<Partial<Record<string, number>>>({});
  const [signHandoffBusy, setSignHandoffBusy] = useState(false);
  const [pickupChecklist, setPickupChecklist] = useState<ChecklistMaps>(() =>
    emptyChecklistMaps(OWNER_PICKUP_ITEMS, RENTER_PICKUP_ITEMS)
  );
  /** Session-only: renter pickup auto-rows (not persisted). */
  const [renterPickupViewFlags, setRenterPickupViewFlags] = useState({
    reviewedOwnerPhotos: false,
    viewedTimestampProof: false,
  });
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
  const [termsExpanded, setTermsExpanded] = useState(true);
  const [meetingExpanded, setMeetingExpanded] = useState(true);
  const [pickupExpanded, setPickupExpanded] = useState(true);
  const [returnExpanded, setReturnExpanded] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerPhase, setPhotoViewerPhase] = useState<VerificationPhase>('pickup');
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [viewerImageLoading, setViewerImageLoading] = useState(false);
  const [viewerImageError, setViewerImageError] = useState<string | null>(null);
  const [viewerImageRetryKey, setViewerImageRetryKey] = useState(0);
  const [agreementModalVisible, setAgreementModalVisible] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [agreementConsent, setAgreementConsent] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [rentalNotes, setRentalNotes] = useState<RentalNoteRow[]>([]);
  const [ownerNoteDraft, setOwnerNoteDraft] = useState('');
  const [renterNoteDraft, setRenterNoteDraft] = useState('');
  const [addingOwnerNote, setAddingOwnerNote] = useState(false);
  const [beginHandoffBusy, setBeginHandoffBusy] = useState(false);
  const [addingRenterNote, setAddingRenterNote] = useState(false);
  const [ownerHandoffNotesExpanded, setOwnerHandoffNotesExpanded] = useState(false);
  const [renterHandoffNotesExpanded, setRenterHandoffNotesExpanded] = useState(false);
  const [pickupChecklistPanelExpanded, setPickupChecklistPanelExpanded] = useState(true);
  const prevPickupPanelSatisfiedRef = useRef(false);
  const [ownerHandoffLinkDraft, setOwnerHandoffLinkDraft] = useState('');
  const [ownerHandoffLinkFieldError, setOwnerHandoffLinkFieldError] = useState<string | null>(null);
  const [ownerInstructionsAddedVisible, setOwnerInstructionsAddedVisible] = useState(false);
  const [editingOwnerInstructionId, setEditingOwnerInstructionId] = useState<string | null>(null);
  /** Trimmed DB `note` when owner entered edit mode; used to disable Save until something changes. */
  const [ownerInstructionEditBaseline, setOwnerInstructionEditBaseline] = useState<string | null>(null);
  const [pickupExampleModalVisible, setPickupExampleModalVisible] = useState(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const ownerHandoffNoteInputRef = useRef<TextInput>(null);
  const ownerHandoffLinkInputRef = useRef<TextInput>(null);
  const editingOwnerInstructionIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const proposalEditorRef = useRef<RentalDetailsCardHandle | null>(null);
  const workflowViewKeyRef = useRef<string>('');
  const offersFromStore = useOffersStore((s) => s.offers);
  const devLifecycleOverride = useDevToolsStore((s) => s.rentalLifecycleOverride);

  const onLifecycleSectionLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    lifecycleSectionYRef.current[key] = e.nativeEvent.layout.y;
  }, []);

  const devAutofillRentalScreen = useCallback(() => {
    setSignatureName(mockAgreementSignatureName());
    setAgreementConsent(true);
    setRenterNoteDraft(mockRenterNoteParagraph());
    setOwnerNoteDraft(mockOwnerPickupInstruction());
    setOwnerHandoffLinkDraft('https://example.com/dev-handoff');
    setOwnerHandoffLinkFieldError(null);
    showFeedbackToast('Dev autofill: agreement + notes');
  }, []);
  useDevPageAutofill(devAutofillRentalScreen, { screenLabel: 'Rental details' });

  const offerForRental = useMemo(() => {
    if (!rental?.offer_id) return undefined;
    const id = String(rental.offer_id).trim();
    if (!id) return undefined;
    return getOfferById(id) ?? offersFromStore.find((o) => o.id === id);
  }, [rental?.offer_id, offersFromStore]);

  const requestPricingCtx = useMemo((): RequestPricingContext | null => {
    if (!request) return null;
    return {
      how: request.how,
      deliveryFee: request.delivery_fee ?? request.deliveryFee,
      pickupDate: request.pickup_date ?? request.pickupDate,
      returnDate: request.return_date ?? request.returnDate,
      location: request.location,
      pickupRadiusMiles: request.pickup_radius_miles ?? request.pickupRadiusMiles,
    };
  }, [request]);

  const negotiatedDeliveryLabel = useMemo(() => {
    if (offerForRental && requestPricingCtx) {
      const { method, fee } = negotiatedDeliveryForOffer(offerForRental, requestPricingCtx);
      return formatNegotiatedDeliverySummary({
        method,
        fee: method === 'owner_delivery' ? fee : null,
      });
    }
    const dm = request?.delivery_method ?? request?.deliveryMethod;
    return typeof dm === 'string' && dm.trim() !== '' ? dm.trim() : '—';
  }, [offerForRental, request, requestPricingCtx]);

  /** Agreement modal: value column only (label is always "Delivery") — no "Delivery: $x" prefix. */
  const agreementDeliveryValue = useMemo(() => {
    if (offerForRental && requestPricingCtx) {
      const { method, fee } = negotiatedDeliveryForOffer(offerForRental, requestPricingCtx);
      if (method === 'pickup') return 'Pickup';
      if (fee == null) return 'Owner delivery';
      if (fee <= 0) return 'Free delivery';
      return formatUsd(fee);
    }
    const dm = request?.delivery_method ?? request?.deliveryMethod;
    return typeof dm === 'string' && dm.trim() !== '' ? dm.trim() : '—';
  }, [offerForRental, request, requestPricingCtx]);

  useEffect(() => {
    setPickupEvidenceDisplay([]);
    setReturnEvidenceDisplay([]);
    setUploadingEvidence(false);
    setPickupChecklistPanelExpanded(true);
    prevPickupPanelSatisfiedRef.current = false;
    setOwnerHandoffNotesExpanded(false);
    setRenterHandoffNotesExpanded(false);
    setOwnerHandoffLinkFieldError(null);
    setOwnerInstructionsAddedVisible(false);
  }, [rentalId]);

  useEffect(() => {
    if (!ownerInstructionsAddedVisible) return;
    const t = setTimeout(() => setOwnerInstructionsAddedVisible(false), 2800);
    return () => clearTimeout(t);
  }, [ownerInstructionsAddedVisible]);

  const handoffCompletedEarly = useMemo(() => {
    if (!rental) return false;
    const s = String(rental.status ?? 'pending').trim().toLowerCase();
    return ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(s);
  }, [rental]);

  const pickupHydrateAsRenter = useMemo(() => {
    if (!me || !rental) return false;
    return me === rental.renter_user_id;
  }, [me, rental]);

  const ownerPickupEvidenceRevision = useMemo(() => {
    const list = pickupEvidenceDisplay.filter(
      (p) => normalizePhase(p.phase) === 'pickup' && normalizeRole(p.role) === 'owner'
    );
    return computeOwnerPickupEvidenceRevision(list);
  }, [pickupEvidenceDisplay]);

  useEffect(() => {
    if (!rentalId || !me || !pickupHydrateAsRenter) return;
    if (handoffCompletedEarly) return;
    let cancelled = false;
    void hydrateRenterPickupViewerFlagsFromEvidence(rentalId, me, ownerPickupEvidenceRevision).then((flags) => {
      if (!cancelled) setRenterPickupViewFlags(flags);
    });
    return () => {
      cancelled = true;
    };
  }, [rentalId, me, pickupHydrateAsRenter, ownerPickupEvidenceRevision, handoffCompletedEarly]);

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

      setRequest(mapSupabaseRequestSelectRowToApp(data as Record<string, unknown>));
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
        owner: fillDefaults(OWNER_PICKUP_ITEMS, stripPickupAutoFromStored('owner', mergedP.owner)),
        renter: fillDefaults(RENTER_PICKUP_ITEMS, stripPickupAutoFromStored('renter', mergedP.renter)),
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
          const pickupPhotoCategory = normalizePickupPhotoCategory(row.pickup_photo_category ?? null);
          if (uri) {
            out.push({
              id: row.id,
              path: row.storage_path,
              signedUrl: uri,
              role,
              phase,
              userId: row.uploaded_by,
              createdAt: row.created_at,
              pickupPhotoCategory,
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
    const status = String(rental?.status ?? 'pending').trim().toLowerCase();
    const isAfterHandoff = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
      status
    );
    setPickupExpanded(!isAfterHandoff);
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

      const pickupPhotoCategory: PickupPhotoCategory | null | undefined = sess.pickupPhotoCategory;
      if (phase === 'pickup' && role === 'owner' && pickupPhotoCategory == null) {
        setRentalEvidenceSession(null);
        setCapturedPhotoUris([]);
        Alert.alert(
          'Category required',
          'Open the camera from Item, Serial, Verification, or Additional so each photo is saved to the right group.'
        );
        return;
      }

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
              pickupPhotoCategory:
                phase === 'pickup' && role === 'owner' ? pickupPhotoCategory ?? null : null,
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
            void displayUri;
          }
          if (failures.length > 0) {
            const schemaMissing = failures.some((f) => f.code === 'pickup_category_schema_missing');
            const allBucketMissing = failures.every((f) => f.code === 'bucket_missing');
            if (schemaMissing) {
              Alert.alert('Upload unavailable', PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE);
            } else if (allBucketMissing) {
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

  const viewerPhotos = photoViewerPhase === 'pickup' ? pickupEvidenceDisplay : returnEvidenceDisplay;
  const viewerPhoto = viewerPhotos[photoViewerIndex] ?? null;
  const viewerSourceUri = viewerPhoto?.signedUrl ?? null;
  const viewerGallerySlideLabel = useCallback(
    (i: number) => {
      const list = photoViewerPhase === 'pickup' ? pickupEvidenceDisplay : returnEvidenceDisplay;
      const p = list[i];
      if (photoViewerPhase === 'return') return 'Return';
      const c = normalizePickupPhotoCategory(p?.pickupPhotoCategory ?? null);
      if (c === 'item') return 'Item';
      if (c === 'serial') return 'Serial';
      if (c === 'timestamp_proof') return 'Verification Photo';
      if (c === 'additional') return 'Extra';
      return 'Photo';
    },
    [photoViewerPhase, pickupEvidenceDisplay, returnEvidenceDisplay]
  );
  useEffect(() => {
    if (!photoViewerVisible) return;
    setViewerImageError(null);
    setViewerImageLoading(Boolean(viewerSourceUri));
  }, [photoViewerVisible, photoViewerIndex, viewerSourceUri]);

  const onProposeRentalDetails = useCallback(
    async (input: { meetupTimeIso: string; returnTimeIso: string; meetupLocation: string }): Promise<boolean> => {
      if (!rental || !me) return false;
      const baselineDurationHours = resolveAgreementBaselineDurationHours(rental, request);
      const proposedDurationHours = durationHoursBetween(input.meetupTimeIso, input.returnTimeIso);
      const durationEval = evaluateDurationChange({
        baselineDurationHours,
        proposedDurationHours,
        graceHours: DURATION_GRACE_HOURS,
      });
      if (durationEval.warningTriggered) {
        const continueProposal = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Duration change',
            [
              'You are proposing a rental duration different from the original agreement.',
              '',
              `Original duration: ${durationEval.originalLabel ?? '—'}`,
              `Proposed duration: ${durationEval.proposedLabel ?? '—'}`,
              '',
              'The other party must approve this change. Pricing and rental terms may change based on the updated duration.',
            ].join('\n'),
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue Proposal', onPress: () => resolve(true) },
            ]
          );
        });
        if (!continueProposal) return false;
      }
      setProposalBusy(true);
      try {
        const iAmOwner = rental.owner_user_id === me;
        const iAmRenter = rental.renter_user_id === me;
        const nowIso = new Date().toISOString();
        const nextProposalVersion =
          typeof rental.proposal_version === 'number' && Number.isFinite(rental.proposal_version)
            ? rental.proposal_version + 1
            : 2;
        const hasCol = (k: string) => Object.prototype.hasOwnProperty.call(rental, k);
        const payload: Record<string, unknown> = {
          meetup_time: input.meetupTimeIso,
          meetup_location: input.meetupLocation,
          return_time: input.returnTimeIso,
          return_location: input.meetupLocation,
          confirmed_by_owner: iAmOwner ? true : false,
          confirmed_by_renter: iAmRenter ? true : false,
        };
        if (hasCol('pickup_datetime')) payload.pickup_datetime = input.meetupTimeIso;
        if (hasCol('return_datetime')) payload.return_datetime = input.returnTimeIso;
        if (hasCol('owner_confirmed')) payload.owner_confirmed = iAmOwner ? true : false;
        if (hasCol('renter_confirmed')) payload.renter_confirmed = iAmRenter ? true : false;
        if (hasCol('agreement_status')) payload.agreement_status = 'pending';
        if (hasCol('confirmed_at')) payload.confirmed_at = null;
        if (hasCol('last_proposed_by')) payload.last_proposed_by = me;
        if (hasCol('proposal_version')) payload.proposal_version = nextProposalVersion;
        if (hasCol('proposal_updated_at')) payload.proposal_updated_at = nowIso;
        if (hasCol('latest_proposal_message_id')) payload.latest_proposal_message_id = null;

        const { error: updateError } = await supabase.from('rentals').update(payload).eq('id', rental.id);
        if (updateError) {
          Alert.alert('Could not save proposal', 'Please try again.');
          return false;
        }

        const receiverId = iAmOwner ? rental.renter_user_id : rental.owner_user_id;
        const requestRowId =
          rental.request_id != null && isUuidString(String(rental.request_id)) ? String(rental.request_id) : null;
        const offerId = rental.offer_id != null && isUuidString(String(rental.offer_id)) ? String(rental.offer_id) : null;
        let messageId: string | null = null;
        if (offerId && receiverId && receiverId !== me) {
          messageId = await insertMeetupProposalOfferMessage({
            offerId,
            requestRowId,
            rentalId: rental.id,
            authorId: me,
            receiverId,
            meetupTimeIso: input.meetupTimeIso,
            returnTimeIso: input.returnTimeIso,
            meetupLocation: input.meetupLocation,
            durationWarningLine: durationEval.warningLine,
          });
          if (!messageId) {
            Alert.alert('Could not post proposal', 'Chat proposal message could not be created.');
            return false;
          }
          insertServerNotificationToRecipient({
            actorId: me,
            recipientUserId: receiverId,
            type: 'message',
            title: durationEval.warningTriggered
              ? `${getProfileNameForUserId(me)} proposed updated meetup times with a changed rental duration`
              : `${getProfileNameForUserId(me)} proposed a pickup time`,
            body: String(request?.title ?? '').trim()
              ? `New meetup proposal for ${String(request?.title).trim()}`
              : 'A meetup time was proposed.',
            offerId,
            requestId: requestRowId,
            rentalId: rental.id,
          });
        }

        if (messageId && Object.prototype.hasOwnProperty.call(rental, 'latest_proposal_message_id')) {
          await supabase.from('rentals').update({ latest_proposal_message_id: messageId }).eq('id', rental.id);
        }
        await refreshVerificationState();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [me, refreshVerificationState, rental, request, request?.title, supabase]
  );

  const onAcceptMeetingProposal = useCallback(async () => {
    if (!rental || !me) return;
    setProposalBusy(true);
    try {
      const patch: Record<string, unknown> = {
        confirmed_by_owner: true,
        confirmed_by_renter: true,
        owner_confirmed: true,
        renter_confirmed: true,
        agreement_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('rentals').update(patch).eq('id', rental.id);
      if (error) {
        Alert.alert('Could not confirm yet', 'Please try again.');
        return;
      }
      await refreshVerificationState();
    } finally {
      setProposalBusy(false);
    }
  }, [me, refreshVerificationState, rental, supabase]);

  const openMeetingProposalEditor = useCallback(() => {
    proposalEditorRef.current?.openProposeModal();
  }, []);

  useEffect(() => {
    if (!rental) return;
    const termsNow =
      rental.price != null || request?.accepted_price != null || request?.acceptedPrice != null;
    const ownerConfirmedNow =
      typeof rental.owner_confirmed === 'boolean'
        ? rental.owner_confirmed
        : typeof rental.confirmed_by_owner === 'boolean'
          ? rental.confirmed_by_owner
          : false;
    const renterConfirmedNow =
      typeof rental.renter_confirmed === 'boolean'
        ? rental.renter_confirmed
        : typeof rental.confirmed_by_renter === 'boolean'
          ? rental.confirmed_by_renter
          : false;
    const agreementNow: 'pending' | 'confirmed' =
      rental.agreement_status === 'confirmed'
        ? 'confirmed'
        : rental.agreement_status === 'pending'
          ? 'pending'
          : ownerConfirmedNow && renterConfirmedNow
            ? 'confirmed'
            : 'pending';
    const proposalActorNow = String(rental.last_proposed_by ?? '').trim();
    const hasPendingNow = agreementNow === 'pending' && proposalActorNow.length > 0;
    const meetingCompletedNow = agreementNow === 'confirmed' && !hasPendingNow;
    const statusNow = String(rental.status ?? 'pending').trim().toLowerCase();
    const returnEnabledNow = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
      statusNow
    );
    const returnDoneNow = ['returned', 'completed', 'cancelled'].includes(statusNow);
    const workflowKey = `${agreementNow}:${hasPendingNow ? 1 : 0}:${returnEnabledNow ? 1 : 0}:${returnDoneNow ? 1 : 0}`;

    if (workflowViewKeyRef.current === workflowKey) return;
    workflowViewKeyRef.current = workflowKey;

    if (!termsNow) {
      setTermsExpanded(true);
      setMeetingExpanded(false);
      setReturnExpanded(false);
      return;
    }
    if (!meetingCompletedNow) {
      setTermsExpanded(false);
      setMeetingExpanded(true);
      setReturnExpanded(false);
      return;
    }
    if (!returnEnabledNow) {
      setTermsExpanded(false);
      setMeetingExpanded(true);
      setReturnExpanded(false);
      return;
    }
    setTermsExpanded(false);
    setMeetingExpanded(true);
    setReturnExpanded(!returnDoneNow);
  }, [me, rental, request?.accepted_price, request?.acceptedPrice]);

  const viewerRoleForHooks: 'owner' | 'renter' | null =
    me && rental
      ? me === rental.owner_user_id
        ? 'owner'
        : me === rental.renter_user_id
          ? 'renter'
          : 'renter'
      : null;

  useEffect(() => {
    if (!photoViewerVisible || photoViewerPhase !== 'pickup') return;
    if (viewerRoleForHooks !== 'renter') return;
    if (!rentalId || !me) return;
    if (handoffCompletedEarly) return;
    const photo = pickupEvidenceDisplay[photoViewerIndex];
    if (!photo || normalizeRole(photo.role) !== 'owner') return;
    setRenterPickupViewFlags((f) => {
      const reviewedOwnerPhotos = true;
      const viewedTimestampProof =
        f.viewedTimestampProof || normalizePickupPhotoCategory(photo.pickupPhotoCategory) === 'timestamp_proof';
      if (f.reviewedOwnerPhotos === reviewedOwnerPhotos && f.viewedTimestampProof === viewedTimestampProof) return f;
      const next = { reviewedOwnerPhotos, viewedTimestampProof };
      void saveRenterPickupViewerFlags(rentalId, me, next, ownerPickupEvidenceRevision);
      return next;
    });
  }, [
    photoViewerVisible,
    photoViewerIndex,
    photoViewerPhase,
    pickupEvidenceDisplay,
    viewerRoleForHooks,
    rentalId,
    me,
    handoffCompletedEarly,
    ownerPickupEvidenceRevision,
  ]);

  const pickupChecklistCollapseModel = useMemo(() => {
    if (!rentalId || !rental) return null;
    const rentalStatus = String(rental.status ?? 'pending').trim().toLowerCase();
    const handoffCompleted = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
      rentalStatus
    );
    const viewerRoleForCollapse: 'owner' | 'renter' =
      me && me === rental.owner_user_id
        ? 'owner'
        : me && me === rental.renter_user_id
          ? 'renter'
          : 'renter';
    const ownerPickupPhotos = pickupEvidenceDisplay.filter(
      (p) => normalizePhase(p.phase) === 'pickup' && normalizeRole(p.role) === 'owner'
    );
    const ownerPickupDoneEffective = buildOwnerPickupDoneEffective(pickupChecklist.owner, ownerPickupPhotos);
    const renterPickupDoneEffective = buildRenterPickupDoneEffective(
      pickupChecklist.renter,
      renterPickupViewFlags,
      pickupAck.renter,
      handoffCompleted
    );
    const ownerPickupChecklistRequiredDone = allRequiredPickupItemsDone(
      OWNER_PICKUP_ITEMS as readonly ChecklistItemDef[],
      ownerPickupDoneEffective
    );
    const renterPickupChecklistRequiredDone = allRequiredPickupItemsDone(
      RENTER_PICKUP_ITEMS as readonly ChecklistItemDef[],
      renterPickupDoneEffective
    );
    const ownerPickupPhotoRequirementMet = ownerPickupPhotoTargetsMet(ownerPickupPhotos);
    const myRow = verificationRows.find((r) => r.phase === 'pickup' && r.role === viewerRoleForCollapse);
    const pickupConfirmedForViewer = Boolean(myRow?.confirmed) || handoffCompleted;
    const pickupPrepOrVerificationComplete =
      viewerRoleForCollapse === 'owner'
        ? ownerPickupChecklistRequiredDone && ownerPickupPhotoRequirementMet
        : renterPickupChecklistRequiredDone;
    return { pickupConfirmedForViewer, pickupPrepOrVerificationComplete };
  }, [
    rentalId,
    rental,
    me,
    pickupChecklist,
    pickupEvidenceDisplay,
    verificationRows,
    pickupAck.renter,
    renterPickupViewFlags,
  ]);

  useEffect(() => {
    if (!pickupChecklistCollapseModel) return;
    const { pickupConfirmedForViewer, pickupPrepOrVerificationComplete: satisfied } = pickupChecklistCollapseModel;
    if (pickupConfirmedForViewer) {
      prevPickupPanelSatisfiedRef.current = false;
      return;
    }
    const prev = prevPickupPanelSatisfiedRef.current;
    if (satisfied && !prev) {
      animateHandoffLayout();
      setPickupChecklistPanelExpanded(false);
    }
    if (!satisfied && prev) {
      animateHandoffLayout();
      setPickupChecklistPanelExpanded(true);
    }
    prevPickupPanelSatisfiedRef.current = satisfied;
  }, [pickupChecklistCollapseModel]);

  const ownerInstructionCombinedBuilt = useMemo(
    () => tryBuildOwnerInstructionCombined(ownerNoteDraft, ownerHandoffLinkDraft),
    [ownerNoteDraft, ownerHandoffLinkDraft]
  );

  useEffect(() => {
    editingOwnerInstructionIdRef.current = editingOwnerInstructionId;
  }, [editingOwnerInstructionId]);

  useEffect(() => {
    if (!editingOwnerInstructionId || !ownerHandoffNotesExpanded) return;
    const t1 = setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }, 220);
    const t2 = setTimeout(() => {
      ownerHandoffNoteInputRef.current?.focus();
    }, 480);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editingOwnerInstructionId, ownerHandoffNotesExpanded]);

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
  const termsCompleted =
    rental.price != null || request?.accepted_price != null || request?.acceptedPrice != null;
  const relationshipSubtitle = 'Owner ↔ Renter';
  const viewerRole: 'owner' | 'renter' =
    me && me === rental.owner_user_id ? 'owner' : me && me === rental.renter_user_id ? 'renter' : 'renter';
  const proposalActorId = String(rental.last_proposed_by ?? '').trim();
  const hasPendingProposal = agreementStatus === 'pending' && proposalActorId.length > 0;
  const iProposedLast = Boolean(me && proposalActorId === me);
  const proposalByLabel =
    proposalActorId === rental.owner_user_id ? 'owner' : proposalActorId === rental.renter_user_id ? 'renter' : null;
  const meetingStatusText =
    agreementStatus === 'confirmed'
      ? 'Accepted meetup details'
      : hasPendingProposal
        ? proposalByLabel
          ? `Pending approval · Proposed by ${proposalByLabel}`
          : 'Pending approval'
        : 'No active proposal';
  const showMeetingAccept = hasPendingProposal && !iProposedLast;
  const showMeetingPrimaryAction = agreementStatus !== 'confirmed' && (!hasPendingProposal || iProposedLast);
  const showMeetingPendingPill = hasPendingProposal && iProposedLast;
  const pickupAtIso = rental.pickup_datetime ?? rental.meetup_time;
  const pickupAtMs = pickupAtIso ? Date.parse(pickupAtIso) : NaN;
  const editLockedByPickupWindow =
    Number.isFinite(pickupAtMs) &&
    pickupAtMs - Date.now() <= RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT * 60 * 60 * 1000;
  const showMeetingConfirmedActions = agreementStatus === 'confirmed';
  const canEditConfirmed = !proposalBusy && !editLockedByPickupWindow;
  const canOpenMeetingProposal =
    termsCompleted &&
    !proposalBusy &&
    (showMeetingAccept || showMeetingPrimaryAction || (showMeetingConfirmedActions && canEditConfirmed));
  const meetingCompleted = agreementStatus === 'confirmed' && !hasPendingProposal;
  const lifecyclePhase =
    DEV_TOOLS_ENABLED && devLifecycleOverride != null
      ? devLifecycleOverride
      : deriveLifecyclePhaseFromRentalStatus(rental.status);
  const lifecycleStatusForLayout = String(rental.status ?? 'pending').trim().toLowerCase();
  const returnWorkflowEnabledForLayout = ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(
    lifecycleStatusForLayout
  );
  const returnCompletedForCard = ['returned', 'completed', 'cancelled'].includes(lifecycleStatusForLayout);
  const termsReplacementValue = Number(rental.replacement_value ?? Math.max(finalPrice * 3, 150));

  const { pickupMs: requestPickupFallbackMs, returnMs: requestReturnFallbackMs } =
    requestPickupReturnFallbackMs(request);
  const requestDerivedAgreed = request ? agreedScheduleIsoPairFromRequest(request) : { pickupIso: null, returnIso: null };
  const meetingPickupIso =
    rental.agreed_pickup_datetime ??
    rental.pickup_datetime ??
    rental.meetup_time ??
    requestDerivedAgreed.pickupIso;
  const meetingReturnIso =
    rental.agreed_return_datetime ??
    rental.return_datetime ??
    rental.return_time ??
    requestDerivedAgreed.returnIso;
  const meetingPickupDisplay =
    meetingPickupIso != null &&
    String(meetingPickupIso).trim() !== '' &&
    Number.isFinite(Date.parse(String(meetingPickupIso)))
      ? formatCompactDateTime(meetingPickupIso)
      : formatAgreementMeetingPickupReturn(
          agreementStatus === 'confirmed',
          null,
          requestPickupFallbackMs
        );
  const meetingReturnDisplay =
    meetingReturnIso != null &&
    String(meetingReturnIso).trim() !== '' &&
    Number.isFinite(Date.parse(String(meetingReturnIso)))
      ? formatCompactDateTime(meetingReturnIso)
      : formatAgreementMeetingPickupReturn(
          agreementStatus === 'confirmed',
          null,
          requestReturnFallbackMs
        );
  const meetupLocationTrimmed = (rental.meetup_location || rental.return_location || '').trim();

  const workflowBannerModel = computeRentalWorkflowBannerModel({
    lifecyclePhase,
    termsCompleted,
    meetingCompleted,
    hasPendingProposal,
    iProposedLast,
    meetupLocation: meetupLocationTrimmed,
    pickupIso: rental.pickup_datetime ?? rental.meetup_time ?? rental.agreed_pickup_datetime,
  });

  const agreementBaselineDurationHoursForProposals = resolveAgreementBaselineDurationHours(rental, request);

  let computedDurationLabel =
    formatDurationDays(
      rental.agreed_pickup_datetime ?? rental.pickup_datetime ?? rental.meetup_time,
      rental.agreed_return_datetime ?? rental.return_datetime ?? rental.return_time
    ) ?? null;
  if (!computedDurationLabel && request) {
    const fd = formatDurationDisplay({
      durationType: (request as { durationType?: string }).durationType,
      durationValue: (request as { durationValue?: number | null }).durationValue,
      duration: (request as { when?: string | null }).when,
    });
    if (fd !== '—') computedDurationLabel = fd;
  }
  if (!computedDurationLabel) {
    const dvRaw = (rental as Record<string, unknown>).duration_value;
    const dv = typeof dvRaw === 'number' && Number.isFinite(dvRaw) ? dvRaw : null;
    const fd = formatDurationDisplay({
      durationType: rental.duration_type ?? undefined,
      durationValue: dv,
      duration: null,
    });
    if (fd !== '—') computedDurationLabel = fd;
  }
  computedDurationLabel = computedDurationLabel ?? '—';
  const durationWarningEval = evaluateDurationChange({
    baselineDurationHours: resolveAgreementBaselineDurationHours(rental, request),
    proposedDurationHours: durationHoursBetween(
      String(rental.pickup_datetime ?? rental.meetup_time ?? ''),
      String(rental.return_datetime ?? rental.return_time ?? '')
    ),
    graceHours: DURATION_GRACE_HOURS,
  });
  const durationWarningVisible = durationWarningEval.warningTriggered;
  const proposalEditorRental: RentalMeetupDetails = {
    ...rental,
    meetup_time: rental.meetup_time ?? rental.pickup_datetime ?? null,
    return_time: rental.return_time ?? rental.return_datetime ?? null,
    meetup_location: rental.meetup_location ?? null,
    return_location: rental.return_location ?? null,
    owner_confirmed: rental.owner_confirmed ?? undefined,
    renter_confirmed: rental.renter_confirmed ?? undefined,
    confirmed_by_owner: Boolean(rental.confirmed_by_owner ?? rental.owner_confirmed),
    confirmed_by_renter: Boolean(rental.confirmed_by_renter ?? rental.renter_confirmed),
  };
  const pickupItems = viewerRole === 'owner' ? OWNER_PICKUP_ITEMS : RENTER_PICKUP_ITEMS;
  const returnItems = viewerRole === 'owner' ? OWNER_RETURN_ITEMS : RENTER_RETURN_ITEMS;
  const returnDoneForRole = returnChecklist[viewerRole];
  const allReturnItemsDone = allItemsDone(returnItems, returnDoneForRole);
  const [pickupChecklistLeft, pickupChecklistRight] = splitForTwoColumns(
    pickupItems as readonly ChecklistItemDef[]
  );
  const [returnChecklistLeft, returnChecklistRight] = splitForTwoColumns(
    returnItems as readonly ChecklistItemDef[]
  );
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
  const myPickupVerificationRow = verificationRows.find(
    (r) => r.phase === 'pickup' && r.role === viewerRole
  );
  const pickupConfirmedForViewer = Boolean(myPickupVerificationRow?.confirmed) || handoffCompleted;
  const ownerHandoffComposerLocked = ownerInputDisabled;
  const ownerInstructionDirty =
    !editingOwnerInstructionId ||
    ownerInstructionEditBaseline === null ||
    (ownerInstructionCombinedBuilt.ok &&
      ownerInstructionCombinedBuilt.combined.trim() !== ownerInstructionEditBaseline.trim());
  const canSubmitOwnerInstructions =
    !ownerHandoffComposerLocked &&
    !addingOwnerNote &&
    ownerInstructionCombinedBuilt.ok &&
    ownerInstructionDirty;
  const ownerNotes = rentalNotes.filter((n) => n.author_role === 'owner');
  const renterNotes = rentalNotes.filter((n) => n.author_role === 'renter');
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
  const ownerPickupBuckets = bucketOwnerPickupPhotos(ownerPickupPhotos);
  const renterReturnPhotos = returnEvidenceDisplay.filter(
    (p) => normalizePhase(p.phase) === 'return' && normalizeRole(p.role) === 'renter'
  );
  const ownerPickupDoneEffective = buildOwnerPickupDoneEffective(pickupChecklist.owner, ownerPickupPhotos);
  const renterPickupDoneEffective = buildRenterPickupDoneEffective(
    pickupChecklist.renter,
    renterPickupViewFlags,
    pickupAck.renter,
    handoffCompleted
  );
  const pickupDoneEffectiveForViewer =
    viewerRole === 'owner' ? ownerPickupDoneEffective : renterPickupDoneEffective;
  const ownerPickupChecklistRequiredDone = allRequiredPickupItemsDone(
    OWNER_PICKUP_ITEMS as readonly ChecklistItemDef[],
    ownerPickupDoneEffective
  );
  const renterPickupChecklistRequiredDone = allRequiredPickupItemsDone(
    RENTER_PICKUP_ITEMS as readonly ChecklistItemDef[],
    renterPickupDoneEffective
  );
  const ownerPickupPhotoRequirementMet = ownerPickupPhotoTargetsMet(ownerPickupPhotos);
  const renterReturnPhotoRequirementMet = renterReturnPhotos.length >= REQUIRED_RETURN_PHOTOS;
  const bilateralPickupReady =
    ownerPickupChecklistRequiredDone &&
    renterPickupChecklistRequiredDone &&
    ownerPickupPhotoRequirementMet;
  const returnReady = renterReturnChecklistDone && renterReturnPhotoRequirementMet && ownerReturnChecklistDone;
  const handoffApprovalStarted = Boolean(rental.handoff_approval_started_at || rental.handoff_approved_by_owner);
  const handoffApprovedByRenter = Boolean(rental.handoff_approved_by_renter);
  /** Single source of truth: owner may tap "Confirm Item Ready" (starts handoff approval for renter). Renter must not be required to confirm first. */
  const canOwnerConfirmPickupReady =
    viewerRole === 'owner' &&
    bilateralPickupReady &&
    lifecyclePhase === 'pickup' &&
    !handoffApprovalStarted &&
    !handoffCompleted;
  const canRenterFinalizeHandoff =
    viewerRole === 'renter' &&
    lifecyclePhase === 'pickup' &&
    handoffApprovalStarted &&
    !handoffApprovedByRenter &&
    bilateralPickupReady;
  const pickupWindow = isPhotoUploadWindowOpen('pickup', rental.pickup_datetime, rental.return_datetime);
  const returnWindow = isPhotoUploadWindowOpen('return', rental.pickup_datetime, rental.return_datetime);
  const canUploadPickup = viewerRole === 'owner' && !handoffCompleted && pickupWindow.allowed;
  const canUploadReturn = viewerRole === 'renter' && returnWorkflowEnabled && !returnCompleted && returnWindow.allowed;
  const returnPhotoUploadBlockedExplanation: string | null = canUploadReturn
    ? null
    : viewerRole !== 'renter'
      ? 'Only the renter adds return verification photos.'
      : !returnWorkflowEnabled
        ? 'Return details unlock after handoff is confirmed.'
        : returnCompleted
          ? 'Return is complete. Evidence is read-only.'
          : returnWindow.helperText ?? 'Return photo upload is not available yet.';

  const lifecycleSteps = [
    { key: 'matched', label: 'Match' },
    { key: 'agreement', label: 'Agree' },
    { key: 'pickup', label: 'Pickup' },
    { key: 'active', label: 'Active' },
    { key: 'return', label: 'Return' },
  ] as const;
  const lifecycleStepDone = [
    true,
    termsCompleted && meetingCompleted,
    handoffCompleted,
    lifecyclePhase === 'return' || lifecyclePhase === 'completed',
    lifecyclePhase === 'completed',
  ];
  let lifecycleNavigatorCurrentIndex = lifecycleStepDone.findIndex((d) => !d);
  if (lifecycleNavigatorCurrentIndex === -1) lifecycleNavigatorCurrentIndex = lifecycleSteps.length - 1;
  const lifecycleTransactionComplete = lifecyclePhase === 'completed';
  let lifecycleAttentionIndex: number | null = null;
  if (!termsCompleted || !meetingCompleted) {
    lifecycleAttentionIndex = 1;
  } else if (!handoffCompleted && (bilateralPickupReady || canRenterFinalizeHandoff || canOwnerConfirmPickupReady)) {
    lifecycleAttentionIndex = 2;
  } else if (returnWorkflowEnabled && !returnCompleted && lifecyclePhase === 'return') {
    lifecycleAttentionIndex = 4;
  }

  const scrollToLifecycleStep = (index: number) => {
    if (index === 1) setTermsExpanded(true);
    if (index === 2) setMeetingExpanded(true);
    if (index === 3) setPickupExpanded(true);
    if (index === 4) setReturnExpanded(true);
    requestAnimationFrame(() => {
      const pad = 12;
      const ys = lifecycleSectionYRef.current;
      let y = 0;
      if (index === 0) y = 0;
      else if (index === 1) y = ys.terms ?? 0;
      else if (index === 2) y = ys.meeting ?? 0;
      else if (index === 3) {
        y = handoffCompleted && ys.active != null ? ys.active : ys.pickup ?? ys.meeting ?? 0;
      } else y = ys.return ?? 0;
      mainScrollRef.current?.scrollTo({ y: Math.max(0, y - pad), animated: true });
    });
  };

  const replacementValue = Number(rental.replacement_value ?? Math.max(finalPrice * 3, 150));
  const preauthAmount = Number(rental.preauth_amount ?? calculatePreauthAmount(replacementValue));
  const lateFee = Number(rental.daily_late_fee ?? Math.max(10, Math.round(finalPrice * 0.1)));
  const maxLateFeeCap = Number(rental.max_late_fee_cap ?? Math.max(lateFee, lateFee * 7));
  const graceHours = Number(rental.grace_period_hours ?? 2);
  const agreementVersion = Math.max(1, Number(rental.agreement_version ?? 1));
  const agreementText = [
    'Return the item in the same condition received, excluding normal wear.',
    'Late fees may apply after the listed grace period.',
    'Damage, loss, missing parts, or non-return may result in charges up to the replacement value.',
    'Verification photos and rental notes may be used during dispute review.',
    'Non-returned items may result in additional recovery action.',
    'Both parties agree that rental evidence and confirmations are part of the rental record.',
  ].join('\n');

  const openPhotoViewer = (phase: VerificationPhase, index: number) => {
    setViewerImageError(null);
    setViewerImageRetryKey(0);
    setPhotoViewerPhase(phase);
    setPhotoViewerIndex(index);
    setPhotoViewerVisible(true);
  };
  const canDeletePhoto = (photo: { role?: PartyRole; phase?: VerificationPhase; userId?: string }): boolean => {
    if (!me) return false;
    const uploader = typeof photo.userId === 'string' ? photo.userId.trim() : '';
    if (!uploader || uploader !== me.trim()) return false;
    const phase = normalizePhase(photo.phase);
    if (!phase) return false;
    if (phase === 'pickup') {
      if (handoffCompleted) return false;
      return true;
    }
    if (phase === 'return') return !returnCompleted;
    return false;
  };

  const confirmDeletePhoto = (photo: PhotoDisplay) => {
    if (!me || !canDeletePhoto(photo)) return;
    Alert.alert('Delete this photo?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteRentalEvidencePhoto({
            client: supabase,
            photoId: photo.id,
            uploadedByUserId: photo.userId ?? '',
            actorUserId: me,
            storagePath: photo.path,
          });
          if (!res.ok) {
            if (__DEV__) {
              console.warn('[verification mutation] photo delete failed', { photoId: photo.id, error: res.error });
            }
            Alert.alert('Could not delete photo', res.error);
            return;
          }
          if (__DEV__) console.log('[verification mutation] photo delete ok', { photoId: photo.id });
          setPhotoViewerVisible(false);
          await refreshVerificationState();
        },
      },
    ]);
  };

  const addNote = async (role: RentalNoteRole, note: string): Promise<boolean> => {
    if (!me || !rental?.id) return false;
    const phase = role === 'owner' ? 'pre_handoff' : 'active_rental';
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
      return false;
    }
    if (__DEV__) {
      console.log('[verification mutation] note insert ok', { rentalId: rental.id, role, phase });
    }
    const rows = await fetchRentalNotes(supabase, rental.id);
    setRentalNotes(rows);
    await refreshVerificationState();
    return true;
  };

  const cancelEditOwnerInstruction = () => {
    setEditingOwnerInstructionId(null);
    setOwnerInstructionEditBaseline(null);
    setOwnerNoteDraft('');
    setOwnerHandoffLinkDraft('');
    setOwnerHandoffLinkFieldError(null);
    setOwnerInstructionsAddedVisible(false);
  };

  const onSaveOwnerInstruction = async () => {
    if (!canSubmitOwnerInstructions || !rental?.id) return;
    const built = tryBuildOwnerInstructionCombined(ownerNoteDraft, ownerHandoffLinkDraft);
    if (!built.ok) {
      if (ownerHandoffLinkDraft.trim() !== '') {
        setOwnerHandoffLinkFieldError('Enter a valid URL (e.g. youtube.com/…)');
      }
      return;
    }
    const combined = built.combined;

    setOwnerHandoffLinkFieldError(null);
    setOwnerInstructionsAddedVisible(false);
    setAddingOwnerNote(true);
    try {
      if (editingOwnerInstructionId) {
        const { error } = await updateRentalNote(supabase, {
          noteId: editingOwnerInstructionId,
          note: combined,
        });
        if (error) {
          Alert.alert('Could not save changes', error);
          return;
        }
        if (__DEV__) {
          console.log('[verification mutation] owner instruction update ok', {
            rentalId: rental.id,
            noteId: editingOwnerInstructionId,
          });
        }
        Keyboard.dismiss();
        setEditingOwnerInstructionId(null);
        setOwnerInstructionEditBaseline(null);
        setOwnerNoteDraft('');
        setOwnerHandoffLinkDraft('');
        setOwnerInstructionsAddedVisible(true);
        const rows = await fetchRentalNotes(supabase, rental.id);
        setRentalNotes(rows);
        await refreshVerificationState();
        return;
      }

      const ok = await addNote('owner', combined);
      if (ok) {
        Keyboard.dismiss();
        setOwnerNoteDraft('');
        setOwnerHandoffLinkDraft('');
        setOwnerInstructionsAddedVisible(true);
      }
    } finally {
      setAddingOwnerNote(false);
    }
  };

  const applyRemoveLinkFromOwnerInstruction = async (noteId: string, url: string) => {
    if (!rental?.id || ownerHandoffComposerLocked) return;
    const note = rentalNotes.find((n) => n.id === noteId);
    if (!note) return;
    const next = rebuildOwnerHandoffNoteRemovingLink(note.note, url);
    if (!next) {
      Alert.alert('Cannot remove link', 'Add note text first, or delete the whole instruction.');
      return;
    }
    setAddingOwnerNote(true);
    try {
      const { error } = await updateRentalNote(supabase, { noteId, note: next });
      if (error) {
        Alert.alert('Could not update instruction', error);
        return;
      }
      animateHandoffLayout();
      const rows = await fetchRentalNotes(supabase, rental.id);
      setRentalNotes(rows);
      const updated = rows.find((r) => r.id === noteId);
      if (updated && editingOwnerInstructionIdRef.current === noteId) {
        setOwnerInstructionEditBaseline(updated.note.trim());
        const parsed = parseOwnerHandoffNoteContent(updated.note);
        setOwnerNoteDraft(parsed.body.slice(0, 300));
        setOwnerHandoffLinkDraft(parsed.links[0]?.url ?? '');
      }
      await refreshVerificationState();
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
    if (!me || handoffCompleted) return;
    const defs = viewerRole === 'owner' ? OWNER_PICKUP_ITEMS : RENTER_PICKUP_ITEMS;
    const def = defs.find((i) => i.id === id);
    if (def?.control === 'auto') return;
    const nextMap = { ...pickupChecklist[viewerRole], [id]: !pickupChecklist[viewerRole][id] };
    const toPersist = manualPickupMapOnly(viewerRole, nextMap);
    void (async () => {
      try {
        await persistChecklistState(supabase, rental.id, 'pickup', me, toPersist);
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

  const persistReadinessFlags = async (
    overrides?: Partial<RentalRow>
  ): Promise<{ ok: true } | { ok: false; error: PostgrestError }> => {
    const payload: Partial<RentalRow> = {
      owner_pickup_ready: ownerPickupChecklistRequiredDone && ownerPickupPhotoRequirementMet,
      renter_pickup_ready: renterPickupChecklistRequiredDone,
      owner_return_ready: ownerReturnChecklistDone,
      renter_return_ready: renterReturnChecklistDone && renterReturnPhotoRequirementMet,
      ...(overrides ?? {}),
    };
    const { data, error } = await supabase.from('rentals').update(payload).eq('id', rental.id).select('*').single();
    if (__DEV__) {
      if (error) console.warn('[verification mutation] readiness/status update failed', { rentalId: rental.id, payload, error });
      else console.log('[verification mutation] readiness/status update ok', { rentalId: rental.id, payload });
    }
    if (error) {
      return { ok: false, error };
    }
    if (data) setRental(data as RentalRow);
    await refreshVerificationState();
    return { ok: true };
  };

  const onReportIssue = () => {
    Alert.alert('Report issue', 'In-app reporting is coming soon. For urgent issues, message your match from chat.');
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

  const onConfirmPickup = () => {
    if (!me) return;
    if (!allRequiredPickupItemsDone(pickupItems, pickupDoneEffectiveForViewer)) return;
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
            }
            await refreshVerificationState();
          },
        },
      ]
    );
  };

  const onBeginHandoffApproval = async () => {
    if (!me || viewerRole !== 'owner' || !canOwnerConfirmPickupReady || beginHandoffBusy) {
      if (__DEV__) {
        console.warn('[pickup] onBeginHandoffApproval blocked', {
          hasMe: Boolean(me),
          viewerRole,
          canOwnerConfirmPickupReady,
          beginHandoffBusy,
          bilateralPickupReady,
          lifecyclePhase,
          handoffApprovalStarted,
          handoffCompleted,
        });
      }
      return;
    }
    setBeginHandoffBusy(true);
    try {
      const holdReplacementValue =
        typeof rental.replacement_value === 'number' ? rental.replacement_value : Math.max(finalPrice * 3, 150);
      const holdPreauthAmount = calculatePreauthAmount(holdReplacementValue);
      const holdLateFee = rental.daily_late_fee ?? Math.max(10, Math.round(finalPrice * 0.1));
      const holdMaxLateFeeCap = rental.max_late_fee_cap ?? Math.max(holdLateFee, holdLateFee * 7);
      const result = await persistReadinessFlags({
        handoff_approved_by_owner: true,
        handoff_approval_started_at: new Date().toISOString(),
        replacement_value: holdReplacementValue,
        preauth_amount: holdPreauthAmount,
        preauth_status: 'pending',
        daily_late_fee: holdLateFee,
        max_late_fee_cap: holdMaxLateFeeCap,
        grace_period_hours: rental.grace_period_hours ?? 2,
      });
      if (!result.ok) {
        const fmt = formatSupabaseMutationFailure(result.error, {
          path: 'rentals.update.persistReadinessFlags.ownerConfirmReady',
          table: 'rentals',
        });
        if (__DEV__) console.warn(fmt.devLog);
        Alert.alert('Could not confirm item ready', fmt.userBody);
      }
    } finally {
      setBeginHandoffBusy(false);
    }
  };

  const onRenterSignAndAuthorize = async () => {
    const signedTrimmed = signatureName.trim();
    if (!signedTrimmed || !agreementConsent || !me || viewerRole !== 'renter' || !canRenterFinalizeHandoff) return;
    if (signHandoffBusy) return;
    setSignHandoffBusy(true);
    const typedNorm = normalizeLegalName(signatureName);
    const signedAt = new Date().toISOString();
    const signingPhotoRefs = [...pickupEvidenceDisplay, ...returnEvidenceDisplay].map((p) => ({
      id: p.id,
      path: p.path ?? null,
      phase: p.phase ?? null,
    }));
    try {
      const snapshot = await insertRentalAgreementSnapshot(supabase, {
        rentalId: rental.id,
        signedByUserId: me,
        agreementVersion,
        agreementText,
        rentalSummaryJson: {
          rental_price: finalPrice,
          pickup_datetime: rental.pickup_datetime ?? null,
          return_datetime: rental.return_datetime ?? null,
          meetup_location: rental.meetup_location ?? null,
          replacement_value: replacementValue,
          preauthorization_amount: preauthAmount,
          daily_late_fee: lateFee,
          max_late_fee_cap: maxLateFeeCap,
          grace_period_hours: graceHours,
        },
        signedNameNormalized: typedNorm,
        signedNameAsEntered: signedTrimmed,
        signedAt,
        replacementValue,
        dailyLateFee: lateFee,
        maxLateFeeCap,
        preauthAmount,
        verificationPhotoRefs: signingPhotoRefs,
      });
      if (!snapshot.ok) {
        if (snapshot.kind === 'schema_unavailable') {
          Alert.alert('Agreement temporarily unavailable', 'Please refresh the app and try again.');
        } else {
          if (__DEV__) console.warn('[agreement] snapshot insert failed', snapshot);
          Alert.alert('Could not finalize agreement', 'Please try again.');
        }
        return;
      }
      const handoffResult = await persistReadinessFlags({
        handoff_approved_by_renter: true,
        signed_name: typedNorm,
        signed_at: signedAt,
        agreement_version: agreementVersion,
        preauth_status: 'authorized',
        preauth_authorized_at: signedAt,
        status: 'handed_off',
      });
      if (!handoffResult.ok) {
        const fmt = formatSupabaseMutationFailure(handoffResult.error, {
          path: 'rentals.update.persistReadinessFlags.renterFinalizeHandoff',
          table: 'rentals',
        });
        if (__DEV__) console.warn(fmt.devLog);
        Alert.alert('Could not finalize handoff', fmt.userBody);
        return;
      }
      if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAgreementModalVisible(false);
      setSignatureName('');
      setAgreementConsent(false);
      showFeedbackToast('Pickup confirmed successfully');
    } finally {
      setSignHandoffBusy(false);
    }
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
            }
            await refreshVerificationState();
          },
        },
      ]
    );
  };

  const openEvidenceCamera = (phase: VerificationPhase, pickupCategory?: PickupPhotoCategory) => {
    if (!me) return;
    if (phase === 'pickup' && viewerRole === 'renter') return;
    if (phase === 'pickup' && viewerRole === 'owner' && !pickupCategory) {
      return;
    }
    if (phase === 'pickup' && viewerRole === 'owner' && !canUploadPickup) {
      Alert.alert(
        'Pickup photos locked',
        handoffCompleted
          ? 'Pickup is complete. Evidence is read-only.'
          : pickupWindow.helperText ?? 'Pickup photo upload is not available yet.'
      );
      return;
    }
    if (phase === 'return' && !canUploadReturn) {
      Alert.alert(
        'Return photos locked',
        returnPhotoUploadBlockedExplanation ?? 'Return photo upload is not available yet.'
      );
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert(
        'Camera',
        'Pickup and return verification photos must be taken live in the OurGarage mobile app.'
      );
      return;
    }
    const st = useCameraSessionStore.getState();
    st.setCapturedPhotoUris([]);
    st.setRentalEvidenceSession({
      rentalId: rental.id,
      phase,
      pickupPhotoCategory:
        phase === 'pickup' && viewerRole === 'owner' ? pickupCategory ?? null : null,
    });
    router.push('/camera');
  };

  const pickupRequiredEntries = pickupItems.filter(
    (i: ChecklistItemDef) => i.required !== false
  );
  const pickupRequiredDoneCount = pickupRequiredEntries.filter((i) => pickupDoneEffectiveForViewer[i.id]).length;

  const pickupConfirmedAt = myPickupVerificationRow?.confirmed_at ?? null;
  const { pickupPrepOrVerificationComplete } = pickupChecklistCollapseModel!;

  const openPickupPhotoById = (id: string) => {
    const idx = pickupEvidenceDisplay.findIndex((p) => p.id === id);
    if (idx >= 0) openPhotoViewer('pickup', idx);
  };

  let pickupPrimaryLabel = '';
  let pickupPrimaryDisabled = true;
  let pickupPrimaryFootnote = '';
  let pickupPrimaryOnPress: (() => void) | undefined;

  if (viewerRole === 'owner') {
    pickupPrimaryLabel = beginHandoffBusy ? 'Saving…' : 'Confirm Item Ready';
    pickupPrimaryDisabled = !canOwnerConfirmPickupReady || beginHandoffBusy;
    pickupPrimaryOnPress = () => void onBeginHandoffApproval();
    const ownerPickupPrepComplete =
      ownerPickupChecklistRequiredDone && ownerPickupPhotoRequirementMet;
    pickupPrimaryFootnote = pickupPrimaryDisabled
      ? !ownerPickupPrepComplete
        ? 'Upload condition, serial, and verification photos, finish your prep checklist, then wait for the renter to confirm receipt.'
        : !bilateralPickupReady
          ? 'Both you and the renter must finish the pickup checklists before you can confirm.'
          : handoffCompleted
            ? 'Pickup is already complete for this rental.'
            : handoffApprovalStarted
              ? 'Handoff approval has already started — continue in chat or refresh if this looks wrong.'
              : ''
      : '';
  } else if (canRenterFinalizeHandoff) {
    pickupPrimaryLabel = 'Sign & authorize';
    pickupPrimaryDisabled = false;
    pickupPrimaryOnPress = () => setAgreementModalVisible(true);
    pickupPrimaryFootnote = '';
  } else if (!pickupAck.renter) {
    pickupPrimaryLabel = 'Confirm Item Received';
    const reqDone = allRequiredPickupItemsDone(pickupItems, pickupDoneEffectiveForViewer);
    pickupPrimaryDisabled = !reqDone;
    pickupPrimaryOnPress = () => onConfirmPickup();
    pickupPrimaryFootnote = pickupPrimaryDisabled
      ? 'Complete your checklist after reviewing the owner’s photos and any optional evidence note.'
      : '';
  } else {
    pickupPrimaryLabel = 'Waiting for owner approval';
    pickupPrimaryDisabled = true;
    pickupPrimaryFootnote = 'The owner will confirm that the item is ready next.';
    pickupPrimaryOnPress = undefined;
  }

  const showPickupEvidenceExamplePanel = !handoffCompleted && !pickupConfirmedForViewer;
  const ownerItemPhotosComplete = ownerPickupBuckets.item.length >= 1;
  const ownerSerialPhotoComplete = ownerPickupBuckets.serial.length >= 1;
  const ownerTimestampPhotoComplete = ownerPickupBuckets.timestampProof.length >= 1;

  const pickupRequirementsBannerText =
    viewerRole === 'renter'
      ? 'Skim the photos, then confirm pickup when everything looks right.'
      : 'Upload condition, serial, and verification photos, finish your prep checklist, then wait for the renter to confirm receipt.';

  const actionFooter = (
    <>
      <Pressable
        pressOpacityFeedback={false}
        style={({ pressed }) => [styles.reportTextHit, pressed && { opacity: 0.72 }]}
        onPress={onReportIssue}
      >
        <Text style={styles.reportTextBtn}>Report Issue</Text>
      </Pressable>
      <Pressable
        pressOpacityFeedback={false}
        style={({ pressed }) => [styles.messageSecondaryBtn, pressed && { opacity: 0.88 }]}
        onPress={() => router.replace('/(tabs)/home')}
      >
        <Text style={styles.messageSecondaryBtnText}>Home</Text>
      </Pressable>
    </>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={ui.surfaceStriped} />
      <ScreenEntrance style={styles.entranceFlex}>
        <AppKeyboardAwareScrollView
          ref={mainScrollRef}
          style={styles.container}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: scrollPadH, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
          ]}
          bottomOffset={insets.bottom + 24}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
        >
          <View style={styles.contentWrap}>
            <BackHeader
              title={request?.title || 'Rental Details'}
              subtitle={relationshipSubtitle}
              onBack={() => router.back()}
              rightAccessory={
                <View style={styles.topChatIconSlot}>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel="Open chat"
                    onPress={openRentalChat}
                    style={({ pressed }) => [
                      styles.topChatIconBtnInner,
                      pressed && styles.topChatIconBtnPressed,
                    ]}
                  >
                    <View style={styles.topChatIconScaled}>
                      <View style={styles.topChatIconCircle}>
                        <Ionicons name="chatbubble-ellipses-outline" size={9} color={ui.primary} />
                      </View>
                    </View>
                  </Pressable>
                </View>
              }
              style={styles.rentalBackHeader}
            />

            {DEV_TOOLS_ENABLED && devLifecycleOverride != null ? (
              <View style={styles.devLifecycleBanner} accessibilityRole="text">
                <Text style={styles.devLifecycleBannerText}>
                  Dev: lifecycle preview — {devLifecycleOverride}
                </Text>
              </View>
            ) : null}

            <View style={styles.lifecycleNavigatorWrap} onLayout={onLifecycleSectionLayout('banner')}>
              <RentalLifecycleNavigator
                steps={lifecycleSteps}
                stepDone={lifecycleStepDone}
                currentIndex={lifecycleNavigatorCurrentIndex}
                attentionIndex={lifecycleAttentionIndex}
                transactionComplete={lifecycleTransactionComplete}
                onStepPress={(i) => scrollToLifecycleStep(i)}
              />
            </View>

            <RentalWorkflowBanner model={workflowBannerModel} onOpenMessages={openRentalChat} />

            <View onLayout={onLifecycleSectionLayout('terms')}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => {
                if (!termsExpanded) setTermsExpanded(true);
              }}
              style={({ pressed }) => [
                styles.detailsCard,
                !isTabletMargins && styles.cardPadPhone,
                termsCompleted && !termsExpanded ? styles.completedCollapsedCard : null,
                !termsExpanded && pressed ? styles.collapsedCardPressed : null,
              ]}
            >
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setTermsExpanded((v) => !v)}
                style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.sectionTitleWithCheck}>
                  <Text style={styles.sectionTitleInline}>Agreed Terms</Text>
                  {termsCompleted ? <Text style={styles.sectionCompleteCheck}>✓</Text> : null}
                </View>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.inlineRoleLabel}>{termsExpanded ? 'Collapse' : 'Expand'}</Text>
                </View>
              </Pressable>
              {!termsExpanded ? (
                <Text style={styles.verificationCollapsedMeta}>
                  {termsCompleted ? 'Confirmed pricing, protection, and preauthorization terms.' : 'Review and confirm agreed financial terms.'}
                </Text>
              ) : (
                <>
                  <View style={styles.costGridRow}>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Final agreed price</Text>
                      <Text style={styles.valueEmphasis}>{formatUsd(finalPrice ?? 0)}</Text>
                    </View>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Delivery</Text>
                      <Text style={styles.valueStandard}>{negotiatedDeliveryLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.costGridRow}>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Replacement value</Text>
                      <Text style={styles.valueStandard}>{formatUsd(replacementValue)}</Text>
                    </View>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Daily late fee</Text>
                      <Text style={styles.valueStandard}>{`${formatUsd(lateFee)}/day`}</Text>
                    </View>
                  </View>
                  <View style={styles.costGridRow}>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Maximum late fee cap</Text>
                      <Text style={styles.valueStandard}>{formatUsd(maxLateFeeCap)}</Text>
                    </View>
                    <View style={styles.costGridCell}>
                      <Text style={styles.label}>Estimated preauthorization hold</Text>
                      <Text style={styles.valueStandard}>{formatUsd(preauthAmount)}</Text>
                    </View>
                  </View>
                  <Text style={styles.preauthHelperText}>
                    This is a temporary authorization hold preview, not an immediate charge.
                  </Text>
                  <Text style={styles.preauthHelperText}>
                    Preauthorization holds are temporary and are only used if the item is returned late, damaged,
                    materially different, or not returned.
                  </Text>
                </>
              )}
            </Pressable>
            </View>

            <View onLayout={onLifecycleSectionLayout('meeting')}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => {
                if (!meetingExpanded && termsCompleted) setMeetingExpanded(true);
              }}
              style={({ pressed }) => [
                styles.agreementCard,
                !isTabletMargins && styles.cardPadPhone,
                meetingCompleted && !meetingExpanded ? styles.completedCollapsedCard : null,
                !termsCompleted ? styles.phaseCardDisabled : null,
                !meetingExpanded && termsCompleted && pressed ? styles.collapsedCardPressed : null,
              ]}
            >
              <Pressable
                pressOpacityFeedback={false}
                disabled={!termsCompleted}
                onPress={() => setMeetingExpanded((v) => !v)}
                style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.sectionTitleWithCheck}>
                  <Text style={styles.sectionTitleInline}>Meeting Details</Text>
                  {meetingCompleted ? <Text style={styles.sectionCompleteCheck}>✓</Text> : null}
                </View>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.inlineRoleLabel}>{meetingExpanded ? 'Collapse' : 'Expand'}</Text>
                </View>
              </Pressable>
              {!meetingExpanded ? (
                <Text style={styles.verificationCollapsedMeta}>
                  {!termsCompleted
                    ? 'Meeting details unlock after agreed terms confirmation.'
                    : meetingCompleted
                      ? 'Confirmed pickup/return schedule and meetup location.'
                      : 'Review or respond to pending meetup proposal.'}
                </Text>
              ) : (
                <>
                  <Text style={styles.meetingProposalStateText}>{meetingStatusText}</Text>
                  {durationWarningVisible ? (
                    <Text style={styles.durationWarningBanner}>
                      ⚠ Duration changed ({durationWarningEval.originalLabel} to {durationWarningEval.proposedLabel}).
                      Final price may require adjustment before acceptance.
                    </Text>
                  ) : null}
                  <View style={styles.agreementGridRow}>
                    <View style={styles.agreementGridCell}>
                      <Text style={styles.metaLabel}>Meetup location</Text>
                      {meetupLocationTrimmed ? (
                        <Text style={styles.agreementLocationValue}>{meetupLocationTrimmed}</Text>
                      ) : (
                        <Pressable
                          pressOpacityFeedback={false}
                          disabled={!canOpenMeetingProposal}
                          onPress={openMeetingProposalEditor}
                          accessibilityRole="button"
                          accessibilityLabel="Propose meetup location"
                          style={({ pressed }) => [
                            styles.meetingProposeLinkHit,
                            pressed && canOpenMeetingProposal && styles.meetingProposeLinkPressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.meetingProposeLink,
                              !canOpenMeetingProposal && styles.meetingProposeLinkDisabled,
                            ]}
                          >
                            Propose
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.agreementGridCell}>
                      <Text style={styles.metaLabel}>Duration</Text>
                      <Text style={styles.agreementSecondaryValue}>
                        {computedDurationLabel}
                        {durationWarningVisible ? '  ⚠' : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.agreementGridRow}>
                    <View style={styles.agreementGridCell}>
                      <Text style={styles.metaLabel}>Pickup</Text>
                      <Text style={styles.agreementDatetimeValue}>{meetingPickupDisplay}</Text>
                    </View>
                    <View style={styles.agreementGridCell} />
                  </View>
                  <View style={[styles.agreementGridRow, styles.agreementGridRowLast]}>
                    <View style={styles.agreementGridCell}>
                      <Text style={styles.metaLabel}>Return</Text>
                      <Text style={styles.agreementDatetimeValue}>{meetingReturnDisplay}</Text>
                    </View>
                    <View style={[styles.agreementGridCell, styles.agreementGridCellTimestamp]}>
                      {showMeetingAccept ? (
                        <View style={styles.meetingActionsRow}>
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            disabled={proposalBusy}
                            onPress={() => void onAcceptMeetingProposal()}
                            style={({ pressed }) => [
                              styles.meetingPrimaryBtn,
                              pressed && styles.meetingPrimaryBtnPressed,
                              proposalBusy && styles.meetingBtnDisabled,
                            ]}
                          >
                            <Text style={styles.meetingPrimaryBtnText}>Accept</Text>
                          </Pressable>
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            disabled={proposalBusy}
                            onPress={openMeetingProposalEditor}
                            style={({ pressed }) => [
                              styles.meetingSecondaryBtn,
                              pressed && styles.meetingSecondaryBtnPressed,
                              proposalBusy && styles.meetingBtnDisabled,
                            ]}
                          >
                            <Text style={styles.meetingSecondaryBtnText}>Modify</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {showMeetingPrimaryAction ? (
                        <View style={styles.meetingActionsRow}>
                          {showMeetingPendingPill ? (
                            <View style={[styles.meetingPrimaryBtn, styles.meetingPendingBtn]}>
                              <Text style={styles.meetingPrimaryBtnText}>Pending</Text>
                            </View>
                          ) : null}
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            disabled={proposalBusy}
                            onPress={openMeetingProposalEditor}
                            style={({ pressed }) => [
                              styles.meetingPrimaryBtn,
                              pressed && styles.meetingPrimaryBtnPressed,
                              proposalBusy && styles.meetingBtnDisabled,
                            ]}
                          >
                            <Text style={styles.meetingPrimaryBtnText}>
                              {hasPendingProposal ? 'Modify' : 'Propose Changes'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {showMeetingConfirmedActions ? (
                        <View style={styles.meetingActionsRow}>
                          <View style={[styles.meetingPrimaryBtn, styles.meetingConfirmedBtn]}>
                            <Text style={styles.meetingPrimaryBtnText}>Confirmed</Text>
                          </View>
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            disabled={proposalBusy}
                            onPress={() => {
                              if (editLockedByPickupWindow) {
                                Alert.alert(
                                  'Meetup edit locked',
                                  `The confirmed meetup can’t be edited within ${RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT} hours of pickup.`
                                );
                                return;
                              }
                              openMeetingProposalEditor();
                            }}
                            style={({ pressed }) => [
                              styles.meetingSecondaryBtn,
                              pressed && styles.meetingSecondaryBtnPressed,
                              !canEditConfirmed && styles.meetingBtnDisabled,
                            ]}
                          >
                            <Text style={styles.meetingSecondaryBtnText}>Edit</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {showMeetingConfirmedActions && editLockedByPickupWindow ? (
                        <Text style={styles.confirmedAtText}>
                          Edit locked {RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT}h before pickup
                        </Text>
                      ) : null}
                      {rental.confirmed_at ? (
                        <Text style={styles.confirmedAtText}>Confirmed {formatDateTime(rental.confirmed_at)}</Text>
                      ) : null}
                    </View>
                  </View>
                </>
              )}
            </Pressable>
            </View>

            {agreementStatus === 'confirmed' ? (
              <View onLayout={onLifecycleSectionLayout('pickup')}>
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
                    {pickupConfirmedForViewer ? (
                      <>
                        <Text style={styles.verificationCollapsedLine}>✅ Pickup confirmed</Text>
                        <Text style={styles.verificationCollapsedMeta}>
                          {pickupConfirmedAt
                            ? `Confirmed ${formatCompactDateTime(pickupConfirmedAt)}`
                            : 'Your confirmation is on file'}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.verificationCollapsedLine}>
                          {viewerRole === 'owner'
                            ? 'Prepare and document the item'
                            : 'Review and verify before accepting'}
                        </Text>
                        <Text style={styles.verificationCollapsedMeta}>
                          {viewerRole === 'owner'
                            ? ownerPickupPhotos.length > 0
                              ? `${ownerPickupPhotos.length} owner photo${ownerPickupPhotos.length === 1 ? '' : 's'} · checklist`
                              : 'Add photos and complete your checklist'
                            : ownerPickupPhotos.length > 0
                              ? `${ownerPickupPhotos.length} photo${ownerPickupPhotos.length === 1 ? '' : 's'} from owner · your checklist`
                              : 'Waiting on owner photos — then confirm receipt'}
                        </Text>
                      </>
                    )}
                  </>
                ) : handoffCompleted ? (
                  <View style={styles.handoffConfirmedSummary}>
                    <Text style={styles.handoffConfirmedTitle}>✅ Pickup confirmed</Text>
                    <Text style={styles.handoffConfirmedMeta}>
                      {pickupConfirmedAt ? formatCompactDateTime(pickupConfirmedAt) : 'Recorded'}
                    </Text>
                    <Text style={styles.handoffConfirmedLock}>Evidence and notes are locked.</Text>
                  </View>
                ) : viewerRole === 'owner' ? (
                  <>
                    <View style={styles.handoffSection}>
                      <View style={styles.handoffSectionTitleRow}>
                        <Ionicons name="shield-checkmark" size={18} color="#166534" />
                        <Text style={styles.handoffSectionTitle}>Verification Photos</Text>
                      </View>
                      <Text style={styles.handoffSectionHelper}>
                        Each tile saves to a fixed category so nothing gets mixed up. Preview below matches what the
                        renter sees.
                      </Text>
                      <View style={styles.handoffTileRow}>
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => openEvidenceCamera('pickup', 'item')}
                          style={({ pressed }) => [
                            styles.handoffPhotoTile,
                            ownerItemPhotosComplete && styles.handoffPhotoTileHighlight,
                            !canUploadPickup && styles.handoffPhotoTileLocked,
                            pressed && canUploadPickup && { opacity: 0.92 },
                            pressed && !canUploadPickup && { opacity: 0.78 },
                          ]}
                        >
                          {ownerItemPhotosComplete ? (
                            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                          ) : (
                            <Ionicons name="camera-outline" size={22} color={ui.textSecondary} />
                          )}
                          <Text style={styles.handoffTileLabel}>Item Photos</Text>
                          <Text
                            style={[
                              styles.handoffTileCount,
                              ownerItemPhotosComplete && styles.handoffTileCountComplete,
                            ]}
                          >
                            {`${ownerPickupBuckets.item.length} / ${OWNER_ITEM_PHOTO_TARGET}${
                              ownerItemPhotosComplete ? ' ✓' : ''
                            }`}
                          </Text>
                        </Pressable>
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => openEvidenceCamera('pickup', 'serial')}
                          style={({ pressed }) => [
                            styles.handoffPhotoTile,
                            ownerSerialPhotoComplete && styles.handoffPhotoTileHighlight,
                            !canUploadPickup && styles.handoffPhotoTileLocked,
                            pressed && canUploadPickup && { opacity: 0.92 },
                            pressed && !canUploadPickup && { opacity: 0.78 },
                          ]}
                        >
                          {ownerSerialPhotoComplete ? (
                            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                          ) : (
                            <Ionicons name="barcode-outline" size={22} color={ui.textSecondary} />
                          )}
                          <Text style={styles.handoffTileLabel}>Serial/Model</Text>
                          <Text
                            style={[
                              styles.handoffTileCount,
                              ownerSerialPhotoComplete && styles.handoffTileCountComplete,
                            ]}
                          >
                            {`${ownerPickupBuckets.serial.length} / ${OWNER_SERIAL_PHOTO_TARGET}${
                              ownerSerialPhotoComplete ? ' ✓' : ''
                            }`}
                          </Text>
                        </Pressable>
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => openEvidenceCamera('pickup', 'timestamp_proof')}
                          style={({ pressed }) => [
                            styles.handoffPhotoTile,
                            ownerTimestampPhotoComplete && styles.handoffPhotoTileHighlight,
                            !canUploadPickup && styles.handoffPhotoTileLocked,
                            pressed && canUploadPickup && { opacity: 0.92 },
                            pressed && !canUploadPickup && { opacity: 0.78 },
                          ]}
                        >
                          {ownerTimestampPhotoComplete ? (
                            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                          ) : (
                            <Ionicons name="shield-checkmark" size={22} color="#166534" />
                          )}
                          <Text style={styles.handoffTileLabel}>Verification Photo</Text>
                          <Text
                            style={[
                              styles.handoffTileCount,
                              ownerTimestampPhotoComplete && styles.handoffTileCountComplete,
                            ]}
                          >
                            {`${ownerPickupBuckets.timestampProof.length} / ${OWNER_TIMESTAMP_PROOF_TARGET}${
                              ownerTimestampPhotoComplete ? ' ✓' : ''
                            }`}
                          </Text>
                        </Pressable>
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => openEvidenceCamera('pickup', 'additional')}
                          style={({ pressed }) => [
                            styles.handoffPhotoTile,
                            !canUploadPickup && styles.handoffPhotoTileLocked,
                            pressed && canUploadPickup && { opacity: 0.92 },
                            pressed && !canUploadPickup && { opacity: 0.78 },
                          ]}
                        >
                          <Ionicons name="add" size={26} color={ui.textSecondary} />
                          <Text style={styles.handoffTileLabel}>Additional Photos</Text>
                          <Text style={styles.handoffTileCount}>
                            {ownerPickupBuckets.additional.length > 0
                              ? `${ownerPickupBuckets.additional.length} extra`
                              : ' '}
                          </Text>
                        </Pressable>
                      </View>

                      {showPickupEvidenceExamplePanel ? (
                        <View style={styles.handoffExamplePanel}>
                          <View style={styles.handoffExampleLeft}>
                            <Text style={styles.handoffExampleTitle}>Verification photo required</Text>
                            <Text style={styles.handoffExampleBody}>
                              Include a handwritten note showing your username and today&apos;s date next to the item.
                            </Text>
                            <Text style={styles.handoffExampleMuted}>
                              This helps confirm the photo was taken for this rental and protects both parties in case of
                              disputes.
                            </Text>
                          </View>
                          <Pressable
                            pressOpacityFeedback={false}
                            onPress={() => setPickupExampleModalVisible(true)}
                            style={({ pressed }) => [
                              styles.handoffExampleImageWrap,
                              pressed && styles.handoffExampleImageWrapPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="View enlarged verification photo example"
                          >
                            <Image
                              source={PICKUP_VERIFICATION_EXAMPLE}
                              style={styles.handoffExampleImage}
                              contentFit="cover"
                            />
                            <View style={styles.handoffExampleBadge}>
                              <Text style={styles.handoffExampleBadgeText}>EXAMPLE</Text>
                            </View>
                            <View style={styles.handoffExampleExpandHint} pointerEvents="none">
                              <Ionicons name="expand-outline" size={15} color="#FFFFFF" />
                            </View>
                          </Pressable>
                        </View>
                      ) : null}

                      <Text style={styles.handoffOwnerPreviewHead}>Preview</Text>
                      <Text style={styles.handoffOwnerPreviewSub}>
                        Same sections and order as the renter&apos;s &quot;Owner Pickup Evidence&quot; — item,
                        serial/model, verification photo, then any additional photos.
                      </Text>

                      <Text style={styles.handoffEvidenceGroupLabel}>Item Photos</Text>
                      {ownerPickupBuckets.item.length > 0 ? (
                        <PickupHandoffItemPhotoRow
                          photos={ownerPickupBuckets.item}
                          openPickupPhotoById={openPickupPhotoById}
                          canDeletePhoto={canDeletePhoto}
                          confirmDeletePhoto={confirmDeletePhoto}
                        />
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>No item photos yet</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            Use the Item Photos tile above. They stay in Item Photos here and for the renter — order of
                            upload does not move them to another group.
                          </Text>
                        </View>
                      )}

                      <Text style={styles.handoffEvidenceGroupLabel}>Serial/Model</Text>
                      {ownerPickupBuckets.serial.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.handoffEvidenceGallery}
                        >
                          {ownerPickupBuckets.serial.map((p) => (
                            <RentalEvidenceThumbnail
                              key={p.id}
                              uri={p.signedUrl}
                              size="handoffWideHero"
                              category="serial"
                              canDelete={canDeletePhoto(p)}
                              onPress={() => openPickupPhotoById(p.id)}
                              onDelete={() => confirmDeletePhoto(p)}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>No serial/model photo yet</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            Use the Serial/Model tile above. You can upload this before item photos — it still appears only
                            under Serial/Model for you and the renter.
                          </Text>
                        </View>
                      )}

                      <VerificationPhotoSectionHeader showTrustBadge={ownerPickupBuckets.timestampProof.length > 0} />
                      {ownerPickupBuckets.timestampProof.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.handoffEvidenceGallery}
                        >
                          {ownerPickupBuckets.timestampProof.map((p) => (
                            <RentalEvidenceThumbnail
                              key={p.id}
                              uri={p.signedUrl}
                              size="handoffWideHero"
                              category="timestamp_proof"
                              canDelete={canDeletePhoto(p)}
                              onPress={() => openPickupPhotoById(p.id)}
                              onDelete={() => confirmDeletePhoto(p)}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>No verification photo yet</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            Use the Verification Photo tile (required). It stays in this section regardless of when you
                            uploaded it.
                          </Text>
                        </View>
                      )}

                      {ownerPickupBuckets.additional.length > 0 ? (
                        <>
                          <Text style={styles.handoffEvidenceGroupLabel}>Additional Photos</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.handoffEvidenceGallery}
                          >
                            {ownerPickupBuckets.additional.map((p) => (
                              <RentalEvidenceThumbnail
                                key={p.id}
                                uri={p.signedUrl}
                                size="handoffSquare"
                                category="additional"
                                canDelete={canDeletePhoto(p)}
                                onPress={() => openPickupPhotoById(p.id)}
                                onDelete={() => confirmDeletePhoto(p)}
                              />
                            ))}
                          </ScrollView>
                        </>
                      ) : null}

                      <Text style={styles.handoffPrivacyHint}>Photos are only visible to participants in this rental.</Text>
                      {!handoffCompleted && pickupWindow.helperText ? (
                        <Text style={styles.photoWindowHelper}>{pickupWindow.helperText}</Text>
                      ) : null}
                    </View>

                    <View style={styles.handoffSection}>
                      <HandoffOwnerNotesAccordion
                        expanded={ownerHandoffNotesExpanded}
                        onToggle={() => setOwnerHandoffNotesExpanded((v) => !v)}
                        mode="owner"
                        title="Owner Notes (Optional)"
                        helperCollapsed="Tap to add pickup instructions or reminders"
                        childrenExpanded={
                          <>
                            <NoteList
                              notes={ownerNotes}
                              showLinkChips
                              instructionMenuForNote={
                                ownerHandoffComposerLocked
                                  ? undefined
                                  : (note) =>
                                      note.phase === 'pre_handoff' && note.author_role === 'owner'
                                        ? {
                                            onEdit: () => {
                                              const parsed = parseOwnerHandoffNoteContent(note.note);
                                              setEditingOwnerInstructionId(note.id);
                                              setOwnerInstructionEditBaseline(note.note.trim());
                                              setOwnerNoteDraft(parsed.body.slice(0, 300));
                                              setOwnerHandoffLinkDraft(parsed.links[0]?.url ?? '');
                                              setOwnerHandoffLinkFieldError(null);
                                              setOwnerInstructionsAddedVisible(false);
                                            },
                                            onDelete: () => {
                                              void (async () => {
                                                if (!rental?.id) return;
                                                setAddingOwnerNote(true);
                                                try {
                                                  const { error } = await deleteRentalNote(supabase, note.id);
                                                  if (error) {
                                                    Alert.alert('Could not delete', error);
                                                    return;
                                                  }
                                                  if (__DEV__) {
                                                    console.log('[verification mutation] owner instruction delete ok', {
                                                      rentalId: rental.id,
                                                      noteId: note.id,
                                                    });
                                                  }
                                                  animateHandoffLayout();
                                                  if (editingOwnerInstructionId === note.id) {
                                                    setEditingOwnerInstructionId(null);
                                                    setOwnerInstructionEditBaseline(null);
                                                    setOwnerNoteDraft('');
                                                    setOwnerHandoffLinkDraft('');
                                                  }
                                                  const rows = await fetchRentalNotes(supabase, rental.id);
                                                  setRentalNotes(rows);
                                                  await refreshVerificationState();
                                                } finally {
                                                  setAddingOwnerNote(false);
                                                }
                                              })();
                                            },
                                            linkChipMenu: {
                                              onEditLink: (url: string) => {
                                                const parsed = parseOwnerHandoffNoteContent(note.note);
                                                setEditingOwnerInstructionId(note.id);
                                                setOwnerInstructionEditBaseline(note.note.trim());
                                                setOwnerNoteDraft(parsed.body.slice(0, 300));
                                                setOwnerHandoffLinkDraft(url);
                                                setOwnerHandoffLinkFieldError(null);
                                                setOwnerInstructionsAddedVisible(false);
                                                setTimeout(() => ownerHandoffLinkInputRef.current?.focus(), 500);
                                              },
                                              onRemoveLink: (url: string) => {
                                                void applyRemoveLinkFromOwnerInstruction(note.id, url);
                                              },
                                            },
                                          }
                                        : undefined
                              }
                            />
                            <View style={styles.handoffInstructionsComposer}>
                              {editingOwnerInstructionId && !ownerHandoffComposerLocked ? (
                                <Text style={styles.handoffEditingInstructionHint}>Editing instruction</Text>
                              ) : null}
                              <TextInput
                                ref={ownerHandoffNoteInputRef}
                                style={styles.handoffNotesTextareaInComposer}
                                value={ownerNoteDraft}
                                onChangeText={(t) => {
                                  setOwnerNoteDraft(t.slice(0, 300));
                                  if (ownerInstructionsAddedVisible) setOwnerInstructionsAddedVisible(false);
                                  if (ownerHandoffLinkFieldError) setOwnerHandoffLinkFieldError(null);
                                }}
                                placeholder="e.g. Hold trigger 2s before starting…"
                                placeholderTextColor={ui.textMuted}
                                multiline
                                editable={!ownerHandoffComposerLocked}
                                maxLength={300}
                                textAlignVertical="top"
                              />
                              <Text style={styles.handoffCharCountInComposer}>{`${ownerNoteDraft.length} / 300`}</Text>
                              <View style={styles.handoffLinkRowInComposer}>
                                <Ionicons name="link-outline" size={18} color={ui.textMuted} style={styles.handoffLinkIcon} />
                                <TextInput
                                  ref={ownerHandoffLinkInputRef}
                                  style={styles.handoffLinkInput}
                                  value={ownerHandoffLinkDraft}
                                  onChangeText={(t) => {
                                    setOwnerHandoffLinkDraft(t);
                                    if (ownerInstructionsAddedVisible) setOwnerInstructionsAddedVisible(false);
                                    if (ownerHandoffLinkFieldError) setOwnerHandoffLinkFieldError(null);
                                  }}
                                  placeholder="https:// or paste a link (optional)"
                                  placeholderTextColor={ui.textMuted}
                                  editable={!ownerHandoffComposerLocked}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  keyboardType="url"
                                />
                              </View>
                              <Text style={styles.handoffLinkHintInComposer}>
                                Optional link — saved with your note as one instruction.
                              </Text>
                              {ownerHandoffLinkFieldError ? (
                                <Text style={styles.handoffLinkFieldError}>{ownerHandoffLinkFieldError}</Text>
                              ) : null}
                              {ownerInstructionsAddedVisible ? (
                                <Text style={styles.handoffInstructionsAddedHint}>Instructions added</Text>
                              ) : null}
                              <Pressable
                                pressOpacityFeedback={false}
                                haptic
                                onPress={() => void onSaveOwnerInstruction()}
                                disabled={!canSubmitOwnerInstructions}
                                style={({ pressed }) => [
                                  styles.handoffAddInstructionsBtn,
                                  !canSubmitOwnerInstructions && styles.handoffAddNoteBtnDisabled,
                                  pressed && canSubmitOwnerInstructions && styles.startButtonPressed,
                                ]}
                              >
                                <Text style={styles.handoffAddNoteBtnText}>
                                  {addingOwnerNote
                                    ? '…'
                                    : editingOwnerInstructionId
                                      ? 'Save changes'
                                      : 'Add instructions'}
                                </Text>
                              </Pressable>
                              {editingOwnerInstructionId && !ownerHandoffComposerLocked ? (
                                <Pressable
                                  pressOpacityFeedback={false}
                                  onPress={cancelEditOwnerInstruction}
                                  style={({ pressed }) => [
                                    styles.handoffEditInstructionCancelWrap,
                                    pressed && { opacity: 0.75 },
                                  ]}
                                >
                                  <Text style={styles.handoffEditInstructionCancelText}>Cancel</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </>
                        }
                      />
                    </View>

                    <View style={styles.handoffSection}>
                      {pickupPrepOrVerificationComplete && !pickupChecklistPanelExpanded ? (
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => {
                            animateHandoffLayout();
                            setPickupChecklistPanelExpanded(true);
                          }}
                          style={({ pressed }) => [
                            styles.pickupChecklistCompleteCard,
                            pressed && styles.pickupChecklistCompleteCardPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: false }}
                        >
                          <Text style={styles.pickupChecklistCompleteTitle}>✅ Pickup prep complete</Text>
                          <Text style={styles.pickupChecklistCompleteSub}>
                            Your evidence and checklist are ready for renter confirmation.
                          </Text>
                        </Pressable>
                      ) : (
                        <>
                          <View style={styles.handoffRespHeader}>
                            <View style={styles.handoffRespTitleRow}>
                              <Ionicons name="list-outline" size={18} color={ui.textSecondary} />
                              <Text style={styles.handoffSectionTitle}>Your Responsibilities</Text>
                            </View>
                            <Text style={styles.handoffProgressPill}>
                              {`${pickupRequiredDoneCount} / ${pickupRequiredEntries.length} completed`}
                            </Text>
                          </View>
                          {pickupItems.map((item) => (
                            <ChecklistRow
                              key={item.id}
                              label={item.label}
                              checked={Boolean(pickupDoneEffectiveForViewer[item.id])}
                              onToggle={() => togglePickupItem(item.id)}
                              readOnly={item.control === 'auto'}
                              helperText={
                                item.control === 'auto' ? pickupAutoRowHelper(item.id, viewerRole) : undefined
                              }
                              disabled={handoffCompleted}
                              onDisabledPress={() =>
                                Alert.alert('Pickup complete', 'Pickup is complete. This checklist can no longer be edited.')
                              }
                            />
                          ))}
                        </>
                      )}
                    </View>

                    <View style={styles.handoffInfoBanner}>
                      <Ionicons name="information-circle-outline" size={18} color="rgba(37, 99, 235, 0.78)" />
                      <Text style={styles.handoffInfoBannerText}>{pickupRequirementsBannerText}</Text>
                    </View>

                    {pickupPrimaryOnPress ? (
                      <Pressable
                        pressOpacityFeedback={false}
                        haptic
                        disabled={pickupPrimaryDisabled}
                        onPress={pickupPrimaryOnPress}
                        style={({ pressed }) => [
                          styles.handoffPrimaryBtn,
                          pickupPrimaryDisabled && styles.handoffPrimaryBtnDisabled,
                          pressed && !pickupPrimaryDisabled && styles.startButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.handoffPrimaryBtnText,
                            pickupPrimaryDisabled && styles.handoffPrimaryBtnTextDisabled,
                          ]}
                        >
                          {pickupPrimaryLabel}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.handoffPrimaryBtn, styles.handoffPrimaryBtnDisabled]}>
                        <Text style={[styles.handoffPrimaryBtnText, styles.handoffPrimaryBtnTextDisabled]}>
                          {pickupPrimaryLabel}
                        </Text>
                      </View>
                    )}
                    {pickupPrimaryFootnote ? (
                      <Text style={styles.handoffPrimaryFootnote}>{pickupPrimaryFootnote}</Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.handoffSection}>
                      <View style={styles.handoffSectionTitleRow}>
                        <Ionicons name="images-outline" size={18} color={ui.primary} />
                        <Text style={styles.handoffSectionTitle}>Owner Pickup Evidence</Text>
                      </View>
                      <Text style={styles.handoffSectionHelper}>
                        Quick review — confirm pickup when you&apos;re satisfied with the evidence.
                      </Text>

                      {showPickupEvidenceExamplePanel ? (
                        <View style={styles.handoffExampleRenterCompact}>
                          <View style={styles.handoffExampleRenterCompactIcon}>
                            <Ionicons name="shield-checkmark" size={22} color="#166534" />
                          </View>
                          <View style={styles.handoffExampleRenterCompactTextCol}>
                            <Text style={styles.handoffExampleRenterCompactTitle}>Verification photo included</Text>
                            <Text style={styles.handoffExampleRenterCompactBody} numberOfLines={2}>
                              Verify the username and date match this rental before confirming receipt.
                            </Text>
                          </View>
                          <Pressable
                            pressOpacityFeedback={false}
                            onPress={() => setPickupExampleModalVisible(true)}
                            style={({ pressed }) => [
                              styles.handoffExampleRenterCompactThumb,
                              pressed && styles.handoffExampleRenterCompactThumbPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="View enlarged verification photo example"
                          >
                            <Image
                              source={PICKUP_VERIFICATION_EXAMPLE}
                              style={styles.handoffExampleRenterCompactThumbImg}
                              contentFit="cover"
                            />
                            <View style={styles.handoffExampleRenterCompactExpandHint} pointerEvents="none">
                              <Ionicons name="expand-outline" size={12} color="#FFFFFF" />
                            </View>
                          </Pressable>
                        </View>
                      ) : null}

                      <VerificationPhotoSectionHeader showTrustBadge={ownerPickupBuckets.timestampProof.length > 0} />
                      {ownerPickupBuckets.timestampProof.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.handoffEvidenceGallery}
                        >
                          {ownerPickupBuckets.timestampProof.map((p) => (
                            <RentalEvidenceThumbnail
                              key={p.id}
                              uri={p.signedUrl}
                              size="handoffWideHero"
                              category="timestamp_proof"
                              canDelete={canDeletePhoto(p)}
                              onPress={() => openPickupPhotoById(p.id)}
                              onDelete={() => confirmDeletePhoto(p)}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>Waiting for verification photo</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            The owner must upload a verification photo (username and date visible) before pickup can be
                            confirmed.
                          </Text>
                        </View>
                      )}

                      <Text style={styles.handoffEvidenceGroupLabel}>Item Photos</Text>
                      {ownerPickupBuckets.item.length > 0 ? (
                        <PickupHandoffItemPhotoRow
                          photos={ownerPickupBuckets.item}
                          openPickupPhotoById={openPickupPhotoById}
                          canDeletePhoto={canDeletePhoto}
                          confirmDeletePhoto={confirmDeletePhoto}
                        />
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>Waiting for owner uploads</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            The owner must upload condition, serial, and verification photos before pickup can be
                            confirmed.
                          </Text>
                        </View>
                      )}

                      <Text style={styles.handoffEvidenceGroupLabel}>Serial/Model</Text>
                      {ownerPickupBuckets.serial.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.handoffEvidenceGallery}
                        >
                          {ownerPickupBuckets.serial.map((p) => (
                            <RentalEvidenceThumbnail
                              key={p.id}
                              uri={p.signedUrl}
                              size="handoffWideHero"
                              category="serial"
                              canDelete={canDeletePhoto(p)}
                              onPress={() => openPickupPhotoById(p.id)}
                              onDelete={() => confirmDeletePhoto(p)}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={styles.handoffEvidenceEmptyBlock}>
                          <Text style={styles.handoffEvidenceEmptyTitle}>Waiting for serial photo</Text>
                          <Text style={styles.handoffEvidenceEmptyBody}>
                            The owner must upload a clear serial or model photo before pickup can be confirmed.
                          </Text>
                        </View>
                      )}

                      {ownerPickupBuckets.additional.length > 0 ? (
                        <>
                          <Text style={styles.handoffEvidenceGroupLabel}>Additional Photos</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.handoffEvidenceGallery}
                          >
                            {ownerPickupBuckets.additional.map((p) => (
                              <RentalEvidenceThumbnail
                                key={p.id}
                                uri={p.signedUrl}
                                size="handoffSquare"
                                category="additional"
                                canDelete={canDeletePhoto(p)}
                                onPress={() => openPickupPhotoById(p.id)}
                                onDelete={() => confirmDeletePhoto(p)}
                              />
                            ))}
                          </ScrollView>
                        </>
                      ) : null}

                      <Text style={styles.handoffPrivacyHint}>Photos are only visible to participants in this rental.</Text>
                    </View>

                    <View style={styles.handoffSection}>
                      <HandoffOwnerNotesAccordion
                        expanded={renterHandoffNotesExpanded}
                        onToggle={() => setRenterHandoffNotesExpanded((v) => !v)}
                        mode="renter"
                        title="Owner instructions"
                        helperCollapsed="Tap to view owner instructions"
                        childrenExpanded={
                          <NoteList notes={ownerNotes} showLinkChips emptyText="No pickup instructions added." />
                        }
                      />
                    </View>

                    <View style={styles.handoffSection}>
                      {pickupPrepOrVerificationComplete && !pickupChecklistPanelExpanded ? (
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => {
                            animateHandoffLayout();
                            setPickupChecklistPanelExpanded(true);
                          }}
                          style={({ pressed }) => [
                            styles.pickupChecklistCompleteCard,
                            pressed && styles.pickupChecklistCompleteCardPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: false }}
                        >
                          <Text style={styles.pickupChecklistCompleteTitle}>✅ Pickup verification complete</Text>
                          <Text style={styles.pickupChecklistCompleteSub}>
                            You reviewed the owner&apos;s evidence and confirmed the item.
                          </Text>
                        </Pressable>
                      ) : (
                        <>
                          <View style={styles.handoffRespHeader}>
                            <View style={styles.handoffRespTitleRow}>
                              <Ionicons name="list-outline" size={18} color={ui.textSecondary} />
                              <Text style={styles.handoffSectionTitle}>Your Responsibilities</Text>
                            </View>
                            <Text style={styles.handoffProgressPill}>
                              {`${pickupRequiredDoneCount} / ${pickupRequiredEntries.length} completed`}
                            </Text>
                          </View>
                          {pickupItems.map((item) => (
                            <ChecklistRow
                              key={item.id}
                              label={item.label}
                              checked={Boolean(pickupDoneEffectiveForViewer[item.id])}
                              onToggle={() => togglePickupItem(item.id)}
                              readOnly={item.control === 'auto'}
                              helperText={
                                item.control === 'auto' ? pickupAutoRowHelper(item.id, viewerRole) : undefined
                              }
                              disabled={handoffCompleted}
                              onDisabledPress={() =>
                                Alert.alert('Pickup complete', 'Pickup is complete. This checklist can no longer be edited.')
                              }
                              light
                            />
                          ))}
                        </>
                      )}
                    </View>

                    <View style={[styles.handoffInfoBanner, styles.handoffInfoBannerRenter]}>
                      <Ionicons name="information-circle-outline" size={18} color="rgba(37, 99, 235, 0.75)" />
                      <Text style={styles.handoffInfoBannerTextRenter}>{pickupRequirementsBannerText}</Text>
                    </View>

                    {pickupPrimaryOnPress ? (
                      <Pressable
                        pressOpacityFeedback={false}
                        haptic
                        disabled={pickupPrimaryDisabled}
                        onPress={pickupPrimaryOnPress}
                        style={({ pressed }) => [
                          styles.handoffPrimaryBtn,
                          pickupPrimaryDisabled && styles.handoffPrimaryBtnDisabled,
                          pressed && !pickupPrimaryDisabled && styles.startButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.handoffPrimaryBtnText,
                            pickupPrimaryDisabled && styles.handoffPrimaryBtnTextDisabled,
                          ]}
                        >
                          {pickupPrimaryLabel}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.handoffPrimaryBtn, styles.handoffPrimaryBtnDisabled]}>
                        <Text style={[styles.handoffPrimaryBtnText, styles.handoffPrimaryBtnTextDisabled]}>
                          {pickupPrimaryLabel}
                        </Text>
                      </View>
                    )}
                    {pickupPrimaryFootnote ? (
                      <Text style={styles.handoffPrimaryFootnote}>{pickupPrimaryFootnote}</Text>
                    ) : null}
                  </>
                )}
              </View>
              </View>
            ) : null}

            {agreementStatus === 'confirmed' && lifecyclePhase === 'active' ? (
              <View onLayout={onLifecycleSectionLayout('active')}>
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
              </View>
            ) : null}

            <View onLayout={onLifecycleSectionLayout('return')}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => {
                if (!returnExpanded && returnWorkflowEnabled) setReturnExpanded(true);
              }}
              style={({ pressed }) => [
                styles.checklistCard,
                !isTabletMargins && styles.cardPadPhone,
                !returnWorkflowEnabled && styles.phaseCardDisabled,
                returnCompletedForCard && !returnExpanded ? styles.completedCollapsedCard : null,
                !returnExpanded && returnWorkflowEnabled && pressed ? styles.collapsedCardPressed : null,
              ]}
            >
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => {
                  if (!returnWorkflowEnabled) {
                    Alert.alert(
                      'Return locked',
                      'Return details unlock after handoff is confirmed.'
                    );
                    return;
                  }
                  setReturnExpanded((v) => !v);
                }}
                style={({ pressed }) => [styles.verificationTitleRow, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.verificationSectionTitle}>Return / Drop-off Details</Text>
                <View style={styles.sectionHeaderRight}>
                  {returnCompletedForCard ? <Text style={styles.sectionCompleteCheck}>✓</Text> : null}
                  <Text style={styles.inlineRoleLabel}>
                    {!returnWorkflowEnabled ? 'Locked' : returnExpanded ? 'Collapse' : 'View'}
                  </Text>
                </View>
              </Pressable>
              {!returnWorkflowEnabled ? (
                <Text style={styles.verificationCollapsedMeta}>Available after handoff is confirmed.</Text>
              ) : !returnExpanded ? (
                <>
                  <Text style={styles.verificationCollapsedMeta}>
                    {returnCompletedForCard
                      ? 'Return workflow complete with verification evidence recorded.'
                      : 'Track return checklist, photos, and final confirmation.'}
                  </Text>
                  {!returnCompleted && !returnWindow.allowed && returnWindow.helperText ? (
                    <View style={[styles.handoffInfoBanner, styles.handoffInfoBannerRenter]}>
                      <Ionicons name="time-outline" size={18} color="rgba(217, 119, 6, 0.95)" />
                      <Text style={styles.handoffInfoBannerTextRenter}>{returnWindow.helperText}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  {!returnCompleted && !returnWindow.allowed && returnWindow.helperText ? (
                    <View style={[styles.handoffInfoBanner, styles.handoffInfoBannerRenter, { marginBottom: 12 }]}>
                      <Ionicons name="time-outline" size={18} color="rgba(217, 119, 6, 0.95)" />
                      <Text style={styles.handoffInfoBannerTextRenter}>{returnWindow.helperText}</Text>
                    </View>
                  ) : null}
                  <View style={styles.handoffSection}>
                    <View style={styles.handoffSectionTitleRow}>
                      <Ionicons name="images-outline" size={18} color={ui.primary} />
                      <Text style={styles.handoffSectionTitle}>Return evidence</Text>
                    </View>
                    <Text style={styles.handoffSectionHelper}>
                      Upload clear return photos. They stay visible only to you and the other party until the rental is
                      complete.
                    </Text>
                  <VerificationPhotosSubsection
                    photos={returnEvidenceDisplay}
                    uploading={uploadingEvidence}
                    onAddPress={() => openEvidenceCamera('return')}
                    onPhotoPress={(idx) => openPhotoViewer('return', idx)}
                    onDeletePhoto={(photoId) => {
                      const photo = returnEvidenceDisplay.find((p) => p.id === photoId);
                      if (photo) confirmDeletePhoto(photo);
                    }}
                    canDeletePhoto={(photo) => canDeletePhoto(photo)}
                    addDisabled={!canUploadReturn}
                    addDisabledReason={returnPhotoUploadBlockedExplanation}
                  />
                  <Text style={styles.photoWindowHelper}>
                    {returnCompleted
                      ? 'Return evidence is locked after return confirmation is completed.'
                      : 'Return evidence remains editable until return confirmation is completed.'}
                  </Text>
                  </View>
                  <View style={styles.handoffSection}>
                    <View style={styles.handoffRespHeader}>
                      <View style={styles.handoffRespTitleRow}>
                        <Ionicons name="list-outline" size={18} color={ui.textSecondary} />
                        <Text style={styles.handoffSectionTitle}>Your responsibilities</Text>
                      </View>
                    </View>
                  <View style={styles.verificationSubheadRow}>
                    <Text style={[styles.verificationSubhead, styles.verificationSubheadSpaced]}>Checklist</Text>
                    <Pressable
                      pressOpacityFeedback={false}
                      onPress={() => {
                        if (returnCompleted) {
                          Alert.alert(
                            'Return checklist locked',
                            'Return is complete. This checklist can no longer be edited.'
                          );
                          return;
                        }
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
                      <Text style={[styles.markAllText, returnCompleted && styles.markAllTextDisabled]}>
                        Check All
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
                            onDisabledPress={() =>
                              Alert.alert(
                                'Return checklist locked',
                                returnCompleted
                                  ? 'Return is complete. This checklist can no longer be edited.'
                                  : 'Return details unlock after handoff is confirmed.'
                              )
                            }
                            light
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
                            onDisabledPress={() =>
                              Alert.alert(
                                'Return checklist locked',
                                returnCompleted
                                  ? 'Return is complete. This checklist can no longer be edited.'
                                  : 'Return details unlock after handoff is confirmed.'
                              )
                            }
                            light
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
                        onDisabledPress={() =>
                          Alert.alert(
                            'Return checklist locked',
                            returnCompleted
                              ? 'Return is complete. This checklist can no longer be edited.'
                              : 'Return details unlock after handoff is confirmed.'
                          )
                        }
                        light
                      />
                    ))
                  )}
                  </View>
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
            </Pressable>
            </View>

            <View style={[styles.actionsCard, !isTabletMargins && styles.cardPadPhone]}>
              {actionFooter}
            </View>
            
          </View>
        </AppKeyboardAwareScrollView>

        <View style={styles.proposalEditorHidden} pointerEvents="none">
          <RentalDetailsCard
            ref={proposalEditorRef}
            rental={proposalEditorRental}
            itemName={request?.title || 'Rental'}
            durationLabel={computedDurationLabel}
            agreementBaselineDurationHours={agreementBaselineDurationHoursForProposals}
            isRenter={viewerRole === 'renter'}
            isOwner={viewerRole === 'owner'}
            busy={proposalBusy}
            onConfirm={onAcceptMeetingProposal}
            onProposeChange={onProposeRentalDetails}
          />
        </View>

        <RentalEvidenceGalleryModal
          visible={photoViewerVisible}
          onClose={() => setPhotoViewerVisible(false)}
          phase={photoViewerPhase}
          photos={viewerPhotos}
          index={photoViewerIndex}
          onIndexChange={setPhotoViewerIndex}
          slideLabel={viewerGallerySlideLabel}
          metaLine={
            viewerPhoto
              ? `${viewerPhoto.role === 'owner' ? 'Owner' : 'Renter'} · ${
                  viewerPhoto.phase === 'return' ? 'Return' : 'Pickup'
                } · ${formatCompactDateTime(viewerPhoto.createdAt ?? null)}`
              : ''
          }
          canDelete={viewerPhoto != null && canDeletePhoto(viewerPhoto)}
          onDelete={() => {
            if (viewerPhoto) confirmDeletePhoto(viewerPhoto);
          }}
          imageRetryKey={viewerImageRetryKey}
          loading={viewerImageLoading}
          error={viewerImageError}
          onRetry={() => {
            setViewerImageError(null);
            setViewerImageLoading(true);
            setViewerImageRetryKey((k) => k + 1);
          }}
          onImageLoadStart={() => {
            setViewerImageLoading(true);
            setViewerImageError(null);
          }}
          onImageLoad={() => setViewerImageLoading(false)}
          onImageError={(msg) => {
            setViewerImageLoading(false);
            setViewerImageError(msg);
            if (__DEV__ && viewerPhoto) {
              console.warn('[verification viewer image error]', {
                photoId: viewerPhoto.id,
                uri: viewerSourceUri,
                error: msg,
              });
            }
          }}
        />

        <Modal
          visible={pickupExampleModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPickupExampleModalVisible(false)}
        >
          <View style={styles.exampleModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPickupExampleModalVisible(false)}
            />
            <View style={styles.exampleModalInner} pointerEvents="box-none">
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setPickupExampleModalVisible(false)}
                style={styles.exampleModalCloseRow}
              >
                <Text style={styles.viewerCloseText}>Close</Text>
              </Pressable>
              <Image
                source={PICKUP_VERIFICATION_EXAMPLE}
                style={styles.exampleModalImage}
                contentFit="contain"
              />
              <Text style={styles.exampleModalCaption}>
                {viewerRole === 'owner'
                  ? "Include a handwritten note showing your username and today's date next to the item. Save it as your Verification Photo. This helps confirm the photo was taken for this rental and protects both parties in case of disputes."
                  : 'Confirm the username and date look reasonable and match what you expect from this rental before you sign off.'}
              </Text>
            </View>
          </View>
        </Modal>

        <Modal visible={agreementModalVisible} transparent animationType="fade" onRequestClose={() => setAgreementModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.agreementModalKeyboardRoot}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
          >
            <View
              style={[
                styles.agreementModalBackdrop,
                {
                  paddingHorizontal: agreementModalLayout.backdropPadH,
                  paddingVertical: agreementModalLayout.backdropPadV,
                },
              ]}
            >
              <View
                style={[
                  styles.agreementModalShell,
                  {
                    width: agreementModalLayout.cardWidth,
                    height: agreementModalLayout.shellHeight,
                    maxHeight: agreementModalLayout.maxShellHeight,
                  },
                  agreementModalLayout.shellMaxWidth != null
                    ? { maxWidth: agreementModalLayout.shellMaxWidth }
                    : null,
                ]}
              >
                <View style={styles.agreementModalHeader}>
                  <View style={styles.agreementModalHeaderTop}>
                    <View style={styles.agreementModalTitleBlock}>
                      <Text style={styles.agreementModalTitle}>Rental Agreement</Text>
                      <Text style={styles.agreementModalVersion}>{`Version ${agreementVersion}`}</Text>
                    </View>
                    <Pressable
                      pressOpacityFeedback={false}
                      accessibilityRole="button"
                      accessibilityLabel="Close agreement"
                      onPress={() => {
                        setAgreementModalVisible(false);
                        setAgreementConsent(false);
                      }}
                      style={({ pressed }) => [styles.agreementModalCloseBtn, pressed && { opacity: 0.65 }]}
                    >
                      <Ionicons name="close" size={26} color={AGREEMENT_HEADING_SLATE} />
                    </Pressable>
                  </View>
                  <Text style={styles.agreementModalHelper}>
                    Please review and accept the rental terms before continuing.
                  </Text>
                  <Text style={styles.agreementModalHelperSecondary}>
                    This agreement helps protect both the owner and renter during the rental.
                  </Text>
                  <View style={styles.agreementModalHeaderRule} />
                </View>

                <ScrollView
                  style={styles.agreementModalBodyScroll}
                  contentContainerStyle={styles.agreementModalBodyContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  bounces
                >
                  <View
                    style={[
                      styles.agreementModalGridRow,
                      agreementModalLayout.threeCol && styles.agreementModalGridRowThree,
                      agreementModalLayout.twoCol && !agreementModalLayout.threeCol && styles.agreementModalGridRowTwo,
                    ]}
                  >
                    <View
                      style={[
                        styles.agreementModalCardBlock,
                        agreementModalLayout.threeCol && styles.agreementModalGridCellThird,
                        agreementModalLayout.twoCol && styles.agreementModalGridCellHalf,
                      ]}
                    >
                      <View style={styles.agreementModalSectionIconRow}>
                        <Ionicons name="calendar-outline" size={20} color={AGREEMENT_HEADING_SLATE} />
                        <Text style={styles.agreementModalSectionTitle}>Rental Details</Text>
                      </View>
                      <AgreementModalKvRow label="Pickup" value={meetingPickupDisplay} />
                      <AgreementModalKvRow label="Return" value={meetingReturnDisplay} />
                      <AgreementModalKvRow label="Meetup location" value={meetupLocationTrimmed || 'Not set'} />
                      <AgreementModalKvRow label="Duration" value={computedDurationLabel} />
                      <AgreementModalKvRow label="Delivery" value={agreementDeliveryValue} />
                    </View>

                    <View
                      style={[
                        styles.agreementModalCardBlock,
                        agreementModalLayout.threeCol && styles.agreementModalGridCellThird,
                        agreementModalLayout.twoCol && styles.agreementModalGridCellHalf,
                      ]}
                    >
                      <View style={styles.agreementModalSectionIconRow}>
                        <Ionicons name="cash-outline" size={20} color={AGREEMENT_HEADING_SLATE} />
                        <Text style={styles.agreementModalSectionTitle}>Financial Terms</Text>
                      </View>
                      <AgreementModalKvRow label="Rental price" value={formatUsd(finalPrice)} />
                      <AgreementModalKvRow label="Replacement value" value={formatUsd(replacementValue)} />
                      <AgreementModalKvRow label="Daily late fee" value={formatUsd(lateFee)} />
                      <AgreementModalKvRow label="Late fee cap" value={formatUsd(maxLateFeeCap)} />
                      <AgreementModalKvRow label="Grace period" value={`${graceHours} hours`} />
                    </View>

                    {agreementModalLayout.threeCol ? (
                      <View style={[styles.agreementModalCardBlock, styles.agreementModalGridCellThird, styles.agreementModalHoldCard]}>
                        <AgreementModalSecurityHoldInner preauthAmount={preauthAmount} />
                      </View>
                    ) : null}
                  </View>

                  {!agreementModalLayout.threeCol ? (
                    <View style={[styles.agreementModalCardBlock, styles.agreementModalHoldCard, styles.agreementModalSectionGap]}>
                      <AgreementModalSecurityHoldInner preauthAmount={preauthAmount} />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.agreementModalGridRow,
                      agreementModalLayout.landscape && agreementModalLayout.isTablet && styles.agreementModalBottomSplit,
                    ]}
                  >
                    <View
                      style={[
                        styles.agreementModalCardBlock,
                        agreementModalLayout.landscape && agreementModalLayout.isTablet && styles.agreementModalBottomWide,
                      ]}
                    >
                      <View style={styles.agreementModalSectionIconRow}>
                        <Ionicons name="checkmark-circle-outline" size={20} color={AGREEMENT_SIGN_GREEN} />
                        <Text style={styles.agreementModalSectionTitle}>Your Responsibilities</Text>
                      </View>
                      <View style={styles.agreementModalBulletList}>
                        {agreementText.split('\n').map((line) => {
                          const body = line.replace(/^\s*\d+\.\s*/, '').trim();
                          if (!body) return null;
                          return (
                            <View key={line} style={styles.agreementModalBulletRow}>
                              <Text style={styles.agreementModalBulletGlyph}>•</Text>
                              <Text style={styles.agreementModalBulletBody}>{body}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    <View
                      style={[
                        styles.agreementModalCardBlock,
                        agreementModalLayout.landscape && agreementModalLayout.isTablet && styles.agreementModalBottomNarrow,
                        styles.agreementModalSignatureCard,
                      ]}
                    >
                      <View style={styles.agreementModalSectionIconRow}>
                        <Ionicons name="create-outline" size={20} color={AGREEMENT_HEADING_SLATE} />
                        <Text style={styles.agreementModalSectionTitle}>Electronic Signature</Text>
                      </View>
                      <Text style={styles.agreementModalSignatureIntro}>
                        By continuing, you agree to the rental terms and authorize the temporary hold described above.
                      </Text>
                      <View style={styles.agreementModalConsentRow}>
                        <Switch
                          value={agreementConsent}
                          onValueChange={setAgreementConsent}
                          trackColor={{ false: '#9CA3AF', true: AGREEMENT_SIGN_GREEN }}
                          thumbColor="#FFFFFF"
                          ios_backgroundColor="#9CA3AF"
                        />
                        <Text style={styles.agreementModalConsentLabel}>I agree to the rental terms</Text>
                      </View>
                      <Text style={styles.agreementModalSignatureFieldLabel}>Full legal name</Text>
                      <Text style={styles.agreementModalSignatureNameHelper}>
                        Enter your legal name to sign this agreement.
                      </Text>
                      <TextInput
                        style={styles.agreementModalSignatureInput}
                        value={signatureName}
                        onChangeText={setSignatureName}
                        placeholder="Type your full legal name"
                        placeholderTextColor={ui.textMuted}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                </ScrollView>

                <View style={[styles.agreementModalFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                  <Pressable
                    pressOpacityFeedback={false}
                    disabled={signHandoffBusy}
                    onPress={() => {
                      setAgreementModalVisible(false);
                      setAgreementConsent(false);
                    }}
                    style={({ pressed }) => [
                      styles.agreementModalFooterCancel,
                      signHandoffBusy && { opacity: 0.5 },
                      pressed && !signHandoffBusy && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.agreementModalFooterCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => void onRenterSignAndAuthorize()}
                    disabled={
                      signatureName.trim().length === 0 || !agreementConsent || signHandoffBusy
                    }
                    style={({ pressed }) => {
                      const canSign =
                        signatureName.trim().length > 0 && agreementConsent && !signHandoffBusy;
                      return [
                        styles.agreementModalFooterPrimary,
                        !canSign && styles.agreementModalFooterPrimaryDisabled,
                        pressed && canSign && { opacity: 0.92 },
                      ];
                    }}
                  >
                    {signHandoffBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.agreementModalFooterPrimaryText,
                          (signatureName.trim().length === 0 || !agreementConsent) &&
                            styles.agreementModalFooterPrimaryTextDisabled,
                        ]}
                      >
                        Sign & Authorize
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  rentalBackHeader: {
    marginBottom: 6,
  },
  devLifecycleBanner: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: ui.radiusCard,
    backgroundColor: '#FFF7ED',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234, 88, 12, 0.35)',
  },
  devLifecycleBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9A3412',
  },
  lifecycleNavigatorWrap: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusCard,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    ...shadowCard,
  },
  /** Keeps header layout width; inner control is scaled 2× for a larger message icon. */
  topChatIconSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  topChatIconBtnInner: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  topChatIconScaled: {
    transform: [{ scale: 2 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  topChatIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7D6ED',
  },
  topChatIconBtnPressed: {
    opacity: 0.86,
  },
  meetingProposeLinkHit: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingVertical: 2,
  },
  meetingProposeLinkPressed: {
    opacity: 0.75,
  },
  meetingProposeLink: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: ui.primary,
    textDecorationLine: 'underline',
  },
  meetingProposeLinkDisabled: {
    color: ui.textMuted,
    textDecorationLine: 'none',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitleWithCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 1,
    gap: 6,
  },
  sectionTitleInline: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.12,
  },
  sectionCompleteCheck: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    color: '#22A35A',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  collapsedCardPressed: {
    opacity: 0.95,
  },
  completedCollapsedCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9AD2B1',
    backgroundColor: '#F1FAF4',
  },
  sectionCompleteText: {
    color: '#2E7D4F',
  },
  meetingProposalStateText: {
    marginTop: -3,
    marginBottom: 9,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  durationWarningBanner: {
    marginTop: -2,
    marginBottom: 8,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#9E2D2F',
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
    alignItems: 'flex-end',
    paddingTop: 8,
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
    marginTop: 6,
    fontSize: 10,
    color: ui.textSubtle,
    lineHeight: 13,
    textAlign: 'right',
  },
  meetingActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  meetingPrimaryBtn: {
    minHeight: 30,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.primary,
  },
  meetingPendingBtn: {
    opacity: 0.6,
  },
  meetingConfirmedBtn: {
    backgroundColor: '#2D825A',
  },
  meetingPrimaryBtnPressed: {
    ...primarySolidPressed,
  },
  meetingPrimaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  meetingSecondaryBtn: {
    minHeight: 30,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
  },
  meetingSecondaryBtnPressed: {
    ...primarySolidPressed,
    opacity: 0.6,
  },
  meetingSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  meetingPendingChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: ui.surfaceInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  meetingPendingChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
  },
  meetingBtnDisabled: {
    opacity: 0.6,
  },
  preauthHelperText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: ui.textSecondary,
  },
  proposalEditorHidden: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
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
  photoThumbWrap: {
    position: 'relative',
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(12, 19, 33, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 12,
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
  photoWindowHelper: {
    marginTop: 4,
    fontSize: 10,
    color: ui.textMuted,
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
  noteItemMenuHit: {
    minWidth: 44,
    minHeight: 40,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 6,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteItemMenuHitPressed: {
    opacity: 0.72,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderRadius: 10,
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
  noteLinkChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  noteLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    maxWidth: '100%',
  },
  noteLinkChipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
  },
  noteInputWrap: {
    marginTop: 6,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteInputInline: {
    flex: 1,
    minHeight: 64,
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
  viewerCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  agreementModalKeyboardRoot: {
    flex: 1,
  },
  agreementModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  agreementModalShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 14,
  },
  agreementModalHeader: {
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  agreementModalHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  agreementModalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  agreementModalTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: AGREEMENT_HEADING_SLATE,
    letterSpacing: -0.3,
  },
  agreementModalVersion: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  agreementModalHelper: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    fontWeight: '400',
  },
  agreementModalHelperSecondary: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#94A3B8',
    fontWeight: '400',
  },
  agreementModalCloseBtn: {
    padding: 4,
    marginTop: -4,
    marginRight: -4,
  },
  agreementModalHeaderRule: {
    marginTop: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
  },
  agreementModalBodyScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  agreementModalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 20,
  },
  agreementModalGridRow: {
    flexDirection: 'column',
    gap: 20,
  },
  agreementModalGridRowTwo: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  agreementModalGridRowThree: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  agreementModalGridCellHalf: {
    flex: 1,
    minWidth: 0,
  },
  agreementModalGridCellThird: {
    flex: 1,
    minWidth: 0,
  },
  agreementModalBottomSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  agreementModalBottomWide: {
    flex: 2,
    minWidth: 0,
  },
  agreementModalBottomNarrow: {
    flex: 1,
    minWidth: 0,
  },
  agreementModalCardBlock: {
    backgroundColor: AGREEMENT_CARD_BG,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  agreementModalHoldCard: {
    backgroundColor: AGREEMENT_HOLD_TINT,
  },
  agreementModalSectionGap: {
    marginTop: 0,
  },
  agreementModalSectionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  agreementModalSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: AGREEMENT_HEADING_SLATE,
    letterSpacing: -0.2,
  },
  agreementModalKvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  agreementModalKvLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 20,
  },
  agreementModalKvValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: AGREEMENT_HEADING_SLATE,
    textAlign: 'right',
    lineHeight: 21,
  },
  agreementModalHoldSubtitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1D4ED8',
    marginBottom: 2,
  },
  agreementModalHoldBodyWrap: {
    gap: 12,
    marginTop: 2,
  },
  agreementModalHoldBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748B',
    fontWeight: '400',
  },
  agreementModalBulletList: {
    gap: 11,
  },
  agreementModalBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  agreementModalBulletGlyph: {
    width: 18,
    fontSize: 14,
    lineHeight: 24,
    color: '#7C8A9E',
  },
  agreementModalBulletBody: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    color: '#7C8A9E',
    fontWeight: '400',
  },
  agreementModalSignatureCard: {
    gap: 16,
  },
  agreementModalSignatureIntro: {
    fontSize: 14,
    lineHeight: 22,
    color: '#7C8A9E',
    fontWeight: '400',
  },
  agreementModalConsentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agreementModalConsentLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: AGREEMENT_HEADING_SLATE,
  },
  agreementModalSignatureFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  agreementModalSignatureNameHelper: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#7C8A9E',
    fontWeight: '400',
  },
  agreementModalSignatureInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: AGREEMENT_HEADING_SLATE,
    fontWeight: '500',
  },
  agreementModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  agreementModalFooterCancel: {
    flex: 0,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.2)',
    backgroundColor: '#FFFFFF',
  },
  agreementModalFooterCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: AGREEMENT_HEADING_SLATE,
  },
  agreementModalFooterPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: AGREEMENT_SIGN_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  agreementModalFooterPrimaryDisabled: {
    backgroundColor: '#A7F3D0',
  },
  agreementModalFooterPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  agreementModalFooterPrimaryTextDisabled: {
    color: '#14532D',
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
    gap: 7,
    paddingVertical: 4,
    marginBottom: 0,
  },
  checklistRowDisabled: {
    opacity: 0.55,
  },
  checklistRowReadOnly: {
    opacity: 0.9,
  },
  checklistLabelBlock: {
    flex: 1,
    gap: 0,
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
  checklistBoxReadOnly: {
    borderColor: 'rgba(26,43,74,0.2)',
  },
  checklistBoxMark: {
    color: ui.primaryOn,
    fontSize: 11,
    fontWeight: '800',
  },
  checklistLabel: {
    fontSize: 13,
    lineHeight: 17,
    color: ui.textPrimary,
    fontWeight: '500',
  },
  checklistLabelChecked: {
    color: ui.textMuted,
  },
  checklistLabelReadOnly: {
    color: ui.textSecondary,
  },
  checklistHelperMuted: {
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(100, 116, 139, 0.82)',
    fontWeight: '500',
  },
  checklistRowLight: {
    paddingVertical: 3,
    marginBottom: 0,
  },
  checklistBoxLight: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.15,
    borderColor: 'rgba(26,43,74,0.22)',
  },
  checklistBoxMarkLight: {
    fontSize: 10,
    fontWeight: '700',
  },
  checklistLabelLight: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '400',
  },
  checklistHelperLight: {
    fontSize: 9,
    lineHeight: 11,
    color: 'rgba(100, 116, 139, 0.68)',
    fontWeight: '400',
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
  handoffConfirmedSummary: {
    paddingVertical: 8,
    gap: 6,
  },
  handoffConfirmedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  handoffConfirmedMeta: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  handoffConfirmedLock: {
    fontSize: 13,
    color: ui.textMuted,
    marginTop: 4,
  },
  handoffSection: {
    marginTop: 10,
  },
  handoffSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handoffSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  handoffSectionTitlePlain: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  handoffSectionHelper: {
    fontSize: 13,
    color: ui.textMuted,
    marginTop: 3,
    lineHeight: 17,
  },
  handoffSectionHelperPad: {
    fontSize: 13,
    color: ui.textMuted,
    marginTop: 3,
    marginBottom: 8,
    lineHeight: 18,
  },
  /** Row of category tiles — use flexWrap instead of horizontal ScrollView so taps aren’t eaten by nested scroll. */
  handoffTileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 10,
    paddingVertical: 9,
  },
  handoffPhotoTile: {
    width: 108,
    minHeight: 112,
    borderRadius: ui.radiusButton,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ui.border,
    backgroundColor: ui.surfaceNeutral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  handoffPhotoTileHighlight: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.55)',
    borderStyle: 'solid',
  },
  /** Window closed or handoff done — still tappable so openEvidenceCamera can show an alert. */
  handoffPhotoTileLocked: {
    opacity: 0.55,
  },
  handoffTileCountComplete: {
    color: '#15803d',
  },
  handoffPrivacyHint: {
    fontSize: 12,
    color: ui.textMuted,
    lineHeight: 17,
    marginTop: 3,
    marginBottom: 2,
  },
  handoffOwnerPreviewHead: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 10,
  },
  handoffOwnerPreviewSub: {
    fontSize: 12,
    color: ui.textMuted,
    lineHeight: 17,
    marginTop: 3,
    marginBottom: 4,
  },
  handoffOwnerPreviewEmpty: {
    fontSize: 13,
    color: ui.textMuted,
    lineHeight: 18,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  handoffEvidenceGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 9,
    marginBottom: 4,
  },
  handoffEvidenceGroupLabelHeading: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    minWidth: 0,
  },
  handoffVerificationHeadingTitleCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  handoffTimestampSectionHeading: {
    marginTop: 9,
    marginBottom: 5,
  },
  handoffTimestampSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  handoffTimestampTrustPillWrap: {
    flexShrink: 0,
    maxWidth: '48%',
  },
  handoffTimestampTrustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 101, 52, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.16)',
  },
  handoffTimestampTrustPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.55,
  },
  handoffItemPreviewCell: {
    position: 'relative',
  },
  handoffItemMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffItemMoreOverlayText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  handoffExampleRenterCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
    maxHeight: 90,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: ui.radiusCard,
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  handoffExampleRenterCompactIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffExampleRenterCompactTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  handoffExampleRenterCompactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  handoffExampleRenterCompactBody: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
  },
  handoffExampleRenterCompactLink: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    marginTop: 1,
  },
  handoffExampleRenterCompactThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.32)',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.14,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  handoffExampleRenterCompactThumbPressed: {
    opacity: 0.9,
  },
  handoffExampleRenterCompactExpandHint: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffExampleRenterCompactThumbImg: {
    width: '100%',
    height: '100%',
  },
  handoffEvidenceGallery: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingBottom: 2,
  },
  handoffEvidenceThumbWrap: {
    borderRadius: ui.radiusButton,
    overflow: 'hidden',
    backgroundColor: ui.surfaceNeutral,
  },
  handoffEvidenceThumb: {
    width: 96,
    height: 96,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceNeutral,
  },
  handoffEvidenceThumbWide: {
    width: '100%',
    maxWidth: 280,
    height: 120,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceNeutral,
  },
  handoffEvidenceThumbPlaceholder: {
    borderWidth: 1,
    borderColor: ui.border,
  },
  handoffEvidenceEmpty: {
    fontSize: 13,
    color: ui.textMuted,
    lineHeight: 18,
    marginBottom: 4,
  },
  handoffEvidenceEmptyBlock: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: ui.radiusCard,
    backgroundColor: ui.surfaceNeutral,
    borderWidth: 1,
    borderColor: ui.border,
    marginBottom: 4,
    gap: 5,
  },
  handoffEvidenceEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  handoffEvidenceEmptyBody: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 19,
  },
  handoffTileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  handoffTileCount: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 4,
  },
  handoffExamplePanel: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: ui.radiusCard,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  handoffExamplePanelRenter: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderColor: 'rgba(37, 99, 235, 0.28)',
    marginBottom: 4,
  },
  handoffExampleLeft: {
    flex: 1,
    minWidth: 0,
  },
  handoffExampleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  handoffExampleBody: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  handoffExampleMuted: {
    fontSize: 11,
    color: ui.textMuted,
    lineHeight: 15,
    marginBottom: 6,
  },
  handoffExampleLinkHit: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  handoffExampleLink: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  handoffExampleImageWrap: {
    width: 96,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  handoffExampleImageWrapPressed: {
    opacity: 0.9,
  },
  handoffExampleExpandHint: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffExampleImage: {
    width: '100%',
    height: 96,
    borderRadius: 10,
  },
  handoffExampleBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  handoffExampleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  handoffNotesAccordionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
    overflow: 'hidden',
  },
  handoffNotesAccordionCardRenter: {
    backgroundColor: 'rgba(241, 245, 249, 0.88)',
  },
  handoffNotesAccordionCardExpanded: {
    borderColor: 'rgba(15, 23, 42, 0.16)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  handoffNotesAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  handoffNotesAccordionHeaderExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.09)',
  },
  handoffNotesAccordionHeaderPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.045)',
  },
  handoffNotesAccordionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  handoffNotesAccordionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  handoffNotesAccordionHelper: {
    fontSize: 12,
    color: ui.textMuted,
    lineHeight: 16,
    fontWeight: '500',
  },
  handoffNotesAccordionBody: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  pickupChecklistCompleteCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.18)',
    backgroundColor: 'rgba(240, 253, 244, 0.65)',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  pickupChecklistCompleteCardPressed: {
    backgroundColor: 'rgba(220, 252, 231, 0.85)',
  },
  pickupChecklistCompleteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  pickupChecklistCompleteSub: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
    fontWeight: '500',
  },
  handoffNotesTextarea: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 12,
    minHeight: 88,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceStriped,
    marginTop: 8,
  },
  handoffEditingInstructionHint: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  handoffInstructionsComposer: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  handoffNotesTextareaInComposer: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 12,
    minHeight: 88,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceStriped,
    marginTop: 0,
  },
  handoffCharCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: ui.textMuted,
    marginTop: 4,
  },
  handoffCharCountInComposer: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: ui.textMuted,
    marginTop: 4,
  },
  handoffLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceStriped,
    marginTop: 10,
    paddingHorizontal: 10,
  },
  handoffLinkRowInComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceStriped,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  handoffLinkIcon: {
    marginRight: 6,
  },
  handoffLinkInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: ui.textPrimary,
  },
  handoffLinkHint: {
    fontSize: 12,
    color: ui.textMuted,
    marginTop: 6,
  },
  handoffLinkHintInComposer: {
    fontSize: 11,
    color: ui.textMuted,
    marginTop: 6,
    lineHeight: 15,
  },
  handoffLinkFieldError: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 8,
    fontWeight: '500',
  },
  handoffInstructionsAddedHint: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 8,
    fontWeight: '600',
  },
  handoffEditInstructionCancelWrap: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  handoffEditInstructionCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
  },
  handoffAddNoteBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: ui.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: ui.radiusButton,
  },
  handoffAddInstructionsBtn: {
    alignSelf: 'stretch',
    marginTop: 12,
    backgroundColor: ui.primary,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  handoffAddNoteBtnDisabled: {
    opacity: 0.45,
  },
  handoffAddNoteBtnText: {
    color: ui.primaryOn,
    fontSize: 14,
    fontWeight: '700',
  },
  handoffRespHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  handoffRespTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  handoffProgressPill: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textMuted,
  },
  handoffInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 11,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: ui.radiusButton,
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.12)',
  },
  handoffInfoBannerRenter: {
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(37, 99, 235, 0.035)',
    borderColor: 'rgba(37, 99, 235, 0.1)',
    gap: 7,
  },
  handoffInfoBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: ui.textSecondary,
    lineHeight: 17,
  },
  handoffInfoBannerTextRenter: {
    flex: 1,
    fontSize: 11.5,
    color: 'rgba(71, 85, 105, 0.9)',
    lineHeight: 15,
    fontWeight: '400',
  },
  handoffPrimaryBtn: {
    marginTop: 11,
    backgroundColor: '#22C55E',
    paddingVertical: 13,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  handoffPrimaryBtnDisabled: {
    backgroundColor: '#94C9A3',
    opacity: 0.85,
  },
  handoffPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  handoffPrimaryBtnTextDisabled: {
    color: 'rgba(255,255,255,0.92)',
  },
  handoffPrimaryFootnote: {
    fontSize: 12,
    color: ui.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
  exampleModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  exampleModalInner: {
    backgroundColor: ui.surfaceStriped,
    borderRadius: ui.radiusCard,
    padding: 16,
    maxHeight: '88%',
  },
  exampleModalCloseRow: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  exampleModalImage: {
    width: '100%',
    height: 360,
    borderRadius: 10,
    backgroundColor: ui.surfaceNeutral,
  },
  exampleModalCaption: {
    fontSize: 12,
    color: ui.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});
