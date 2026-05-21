import React, { useLayoutEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import {
  logMeetupCoordinationCardRender,
  type MeetupCoordinationCardDiagnostics,
  type MeetupCoordinationCardRenderSnapshot,
  type RentalCoordinationFieldAudit,
} from '@/lib/meetupCoordinationCardRenderDiagnostics';
import type { MeetupPhaseCoordinationLane } from '@/lib/rentalMeetupPhaseCoordinationState';

function formatLaneDateTime(iso: string | null): string {
  if (!iso) return 'Not set';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Not set';
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export type MeetupPhaseCoordinationCardProps = {
  title: string;
  lane: MeetupPhaseCoordinationLane;
  busy?: boolean;
  onPropose: () => void;
  onModify: () => void;
  onAccept: () => void;
  onDecline: () => void;
  /** DEV: proves rendered UI reads canonical lane props, not rental row fields. */
  diagnostics?: MeetupCoordinationCardDiagnostics;
  rentalAudit?: RentalCoordinationFieldAudit;
};

export function MeetupPhaseCoordinationCard({
  title,
  lane,
  busy = false,
  onPropose,
  onModify,
  onAccept,
  onDecline,
  diagnostics,
  rentalAudit,
}: MeetupPhaseCoordinationCardProps) {
  const renderSnapshotRef = useRef<MeetupCoordinationCardRenderSnapshot | null>(null);

  useLayoutEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__ || !diagnostics) return;
    renderSnapshotRef.current = logMeetupCoordinationCardRender({
      lane,
      diagnostics: {
        ...diagnostics,
        componentKey:
          diagnostics.componentKey ||
          `${diagnostics.surface}:${lane.phase}:${diagnostics.coordinationLiveRevision}`,
      },
      prev: renderSnapshotRef.current,
      rentalAudit: rentalAudit ?? null,
    });
  }, [lane, diagnostics, rentalAudit]);

  const statusTone =
    lane.status === 'needs_response'
      ? styles.statusNeedsResponse
      : lane.status === 'confirmed'
        ? styles.statusConfirmed
        : lane.isPendingThisPhase
          ? styles.statusPending
          : styles.statusNeutral;

  return (
    <View style={[styles.card, !lane.unlocked && styles.cardLocked]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.statusPill, statusTone]}>
          <Text style={styles.statusPillText}>{lane.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Location</Text>
        <Text style={styles.fieldValue}>{lane.location || 'Not set'}</Text>
      </View>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Date & time</Text>
        <Text style={styles.fieldValue}>{formatLaneDateTime(lane.dateTimeIso)}</Text>
      </View>

      {lane.isPendingThisPhase && lane.proposedByRole ? (
        <Text style={styles.proposerHint}>
          {lane.proposedByRole === 'owner' ? 'Owner' : 'Renter'} proposed {lane.phase} details
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        {lane.viewerCanAccept ? (
          <>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              disabled={busy}
              onPress={onAccept}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>Accept</Text>
            </Pressable>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              disabled={busy}
              onPress={onDecline}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
            >
              <Text style={styles.secondaryBtnText}>Decline</Text>
            </Pressable>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              disabled={busy}
              onPress={onModify}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
            >
              <Text style={styles.secondaryBtnText}>Modify</Text>
            </Pressable>
          </>
        ) : null}

        {lane.viewerCanPropose ? (
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={busy || !lane.unlocked}
            onPress={onPropose}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnText}>Propose</Text>
          </Pressable>
        ) : null}

        {!lane.viewerCanAccept && lane.viewerCanModify && !lane.viewerCanPropose ? (
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={busy || !lane.unlocked}
            onPress={onModify}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnText}>{lane.isPendingThisPhase ? 'Modify' : 'Edit'}</Text>
          </Pressable>
        ) : null}

        {lane.viewerIsProposer && lane.isPendingThisPhase ? (
          <View style={[styles.primaryBtn, styles.pendingBtn]}>
            <Text style={styles.primaryBtnText}>Pending</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.cardBg,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  cardLocked: {
    opacity: 0.72,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  statusNeutral: {
    backgroundColor: '#EEF1F6',
  },
  statusPending: {
    backgroundColor: '#FFF4DE',
  },
  statusNeedsResponse: {
    backgroundColor: '#E8F1FF',
  },
  statusConfirmed: {
    backgroundColor: '#E7F6EE',
  },
  fieldRow: {
    gap: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldValue: {
    fontSize: 15,
    color: ui.textPrimary,
  },
  proposerHint: {
    fontSize: 13,
    color: ui.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pendingBtn: {
    backgroundColor: '#8E8E93',
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: ui.background,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryBtnText: {
    color: ui.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
