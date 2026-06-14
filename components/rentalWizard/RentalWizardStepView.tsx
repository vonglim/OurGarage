import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardTransitionShell } from '@/components/rentalWizard/shells/WizardTransitionShell';
import { CoordinatePickupStep } from '@/components/rentalWizard/steps/CoordinatePickupStep';
import { EquipmentInspectionStep } from '@/components/rentalWizard/steps/EquipmentInspectionStep';
import { RentalAgreementReviewStep } from '@/components/rentalWizard/steps/RentalAgreementReviewStep';
import { LegacyMeetupStepRedirect } from '@/components/rentalWizard/steps/LegacyMeetupStepRedirect';
import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { DigitalSignatureStep } from '@/components/rentalWizard/steps/DigitalSignatureStep';
import { RentalActivationStep } from '@/components/rentalWizard/steps/RentalActivationStep';
import { SecurityHoldAuthorizationStep } from '@/components/rentalWizard/steps/SecurityHoldAuthorizationStep';
import { PreparePickupStep } from '@/components/rentalWizard/steps/PreparePickupStep';
import { CancelledSummaryStep } from '@/components/rentalWizard/steps/CancelledSummaryStep';
import { RentalConfirmedTransitionStep } from '@/components/rentalWizard/steps/RentalConfirmedTransitionStep';
import { CoordinateReturnStep } from '@/components/rentalWizard/steps/CoordinateReturnStep';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { MeetupDayScheduleSection } from '@/components/rentalWizard/shared/MeetupDayScheduleSection';
import { WizardDarkMeetupCards } from '@/components/rentalWizard/shared/WizardMeetupCards';
import { WizardTransitionConfirmedDetails } from '@/components/rentalWizard/shared/WizardTransitionConfirmedDetails';
import { ui } from '@/constants/appUi';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

function resolveMeetupDayPresence(ctx: RentalWizardContext) {
  const completion = resolvePickupHandoffCompletionState(
    buildPickupHandoffCompletionInputFromWizard(ctx)
  );
  return resolvePickupHandoffPresenceState({
    rental: ctx.rental,
    renterPickupImHereAt: ctx.wizardProgress.renter_pickup_im_here_at,
    renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
    pickupAck: ctx.pickupAck,
    ownerPickupPrepComplete: false,
    handoffApprovalStarted: Boolean(
      ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
    ),
    handoffCompleted: ctx.pickupHandoffComplete,
    renterConfirmedReceipt: completion.renterConfirmedReceipt,
    ownerConfirmedHandoff: completion.ownerConfirmedHandoff,
    viewerRole: 'renter',
  });
}

export type RentalWizardStepViewProps = {
  step: RentalWizardStep;
};

export function RentalWizardStepView({ step }: RentalWizardStepViewProps) {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const meta = WIZARD_STEP_META[step];
  const ownerLine = formatBorrowingFromOwner(ctx.ownerDisplayName);
  const itemCardProps = {
    title: ctx.displayTitle,
    ownerLine,
    rentalCode: ctx.rentalCodeLabel,
    thumbUri: ctx.heroImageUrl,
  };

  switch (step) {
    case 'cancelled':
      return <CancelledSummaryStep />;

    case 'transition_rental_confirmed':
      return <RentalConfirmedTransitionStep />;

    case 'coordinate_pickup':
      return <CoordinatePickupStep />;

    case 'transition_pickup_confirmed':
      return (
        <WizardTransitionShell
          hideHeaderTitle
          headline="Great! Pickup details confirmed"
          subheadline="You and the owner have agreed on the pickup location and handoff time. Next, let's confirm where and when the item will be returned."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_pickup_confirmed')}
        >
          <WizardTransitionConfirmedDetails
            phase="pickup"
            location={ctx.rental.meetup_location}
            scheduleIso={ctx.pickupIso}
          />
        </WizardTransitionShell>
      );

    case 'coordinate_return':
      return <CoordinateReturnStep />;

    case 'transition_return_confirmed':
      return (
        <WizardTransitionShell
          hideHeaderTitle
          headline="Return location and time set"
          subheadline="You're all set for return. Next we'll get you ready for pickup day."
          iconTint="green"
          primaryLabel="Continue"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          onPrimary={() => void w.advanceAfterTransition('transition_return_confirmed')}
        >
          <WizardTransitionConfirmedDetails
            phase="return"
            location={ctx.rental.return_location ?? ctx.rental.meetup_location}
            scheduleIso={ctx.returnIso}
          />
        </WizardTransitionShell>
      );

    case 'transition_all_set':
      return (
        <WizardTransitionShell
          title="All set for pickup & return"
          headline="Perfect! You're all set for pickup and return."
          subheadline="Your pickup and return details are confirmed."
          onBack={() => router.back()}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_all_set')}
        >
          <WizardDarkMeetupCards ctx={ctx} />
        </WizardTransitionShell>
      );

    case 'prepare_pickup':
      return <PreparePickupStep />;

    case 'transition_pickup_ready':
      return (
        <WizardTransitionShell
          title="Pickup ready"
          headline="You're ready for pickup!"
          subheadline="Pickup is confirmed and the owner has completed their preparation."
          iconTint="green"
          icon="checkmark-circle"
          onBack={() => router.back()}
          primaryLabel={w.arrivalActionBusy ? 'Saving…' : "I'm here"}
          onPrimary={() => void w.markImHerePickup()}
          primaryDisabled={w.arrivalActionBusy}
        >
          <WizardDarkMeetupCards ctx={ctx} />
          <MeetupDayScheduleSection
            ctx={ctx}
            proposalBusy={w.proposalBusy}
            onSubmitExtension={w.submitMeetupDayPickupExtension}
            onAcceptProposal={w.acceptMeetupDayPickupProposal}
            onDeclineProposal={w.declineMeetupDayPickupProposal}
          />
          <View style={styles.statusPill}>
            <Ionicons name="time-outline" size={16} color="#A5B4FC" />
            <Text style={styles.statusPillText}>
              We'll notify you when the owner arrives. See you there!
            </Text>
          </View>
        </WizardTransitionShell>
      );

    case 'meetup_day': {
      const presence = resolveMeetupDayPresence(ctx);
      const waitingForOwner = presence.renterLivePhase === 'waiting_for_owner';
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={
            waitingForOwner ? 'Waiting for owner' : w.arrivalActionBusy ? 'Saving…' : "I'm here"
          }
          onPrimary={waitingForOwner ? () => {} : () => void w.markImHerePickup()}
          primaryDisabled={waitingForOwner || w.arrivalActionBusy}
          secondaryLabel="Preview rental agreement"
          onSecondary={w.openAgreementPreview}
          footerInlineActions={[
            {
              label: 'Message owner',
              onPress: w.openMessages,
            },
          ]}
        >
          <WizardItemCard {...itemCardProps} />
          <InfoPanel
            icon="location-outline"
            title="Meetup location"
            value={formatWizardLocation(ctx.rental.meetup_location)}
            actionLabel="View map"
          />
          <InfoPanel icon="calendar-outline" title="Pickup time" value={formatWizardDateTime(ctx.pickupIso)} />
          <MeetupDayScheduleSection
            ctx={ctx}
            proposalBusy={w.proposalBusy}
            onSubmitExtension={w.submitMeetupDayPickupExtension}
            onAcceptProposal={w.acceptMeetupDayPickupProposal}
            onDeclineProposal={w.declineMeetupDayPickupProposal}
          />
          {waitingForOwner ? (
            <StatusBanner
              tone="info"
              title="You're here"
              body="Waiting for the owner to mark arrival at the meetup."
            />
          ) : null}
          <ArrivalChecklist />
        </WizardLightShell>
      );
    }

    case 'owner_confirmed_arrival':
      return <EquipmentInspectionStep />;

    case 'equipment_confirmation':
    case 'rental_authorization':
    case 'rental_agreement_intro':
    case 'liability_disclosures':
    case 'transition_agreement_reviewed':
    case 'transition_disclosures_complete':
    case 'transition_hold_authorized':
    case 'transition_agreement_signed':
    case 'transition_rental_activated':
      return <LegacyMeetupStepRedirect />;

    case 'rental_agreement':
      return <RentalAgreementReviewStep />;

    case 'security_hold_authorization':
      return <SecurityHoldAuthorizationStep />;

    case 'digital_signature':
      return <DigitalSignatureStep />;

    case 'rental_activation':
      return <RentalActivationStep />;

    case 'transition_enjoy_rental':
      return (
        <MeetupLifecycleShell
          phase="rental_active"
          progressIndex={2}
          title="Enjoy your rental"
          subtitle={`Your rental is officially active. Return by ${formatWizardDateTime(ctx.returnIso)}.`}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Go to my rental"
          onPrimary={() => void w.advanceAfterTransition('transition_enjoy_rental')}
          secondaryLabel="Message owner"
          onSecondary={w.openMessages}
        >
          <View style={styles.enjoyHero}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.enjoyTitle}>Enjoy your rental!</Text>
            <Text style={styles.enjoyBody}>
              Protection is active and your rental period has started.
            </Text>
          </View>
          <WizardActionRow
            icon="time-outline"
            title="Need more time?"
            body="Request an extension before your return time."
            onPress={w.openAdvancedDetails}
          />
          <WizardActionRow
            icon="chatbubble-outline"
            title="Messages are open"
            body="You can message the owner anytime during your rental."
            onPress={w.openMessages}
          />
        </MeetupLifecycleShell>
      );

    case 'active_rental':
      return (
        <MeetupLifecycleShell
          phase="rental_active"
          progressIndex={2}
          title="Your rental"
          subtitle={`Return by ${formatWizardDateTime(ctx.returnIso)}`}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Message owner"
          onPrimary={w.openMessages}
          secondaryLabel="Request extension"
          onSecondary={() => w.openAdvancedDetails()}
        >
          <View style={styles.enjoyHero}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.enjoyTitle}>Enjoy your rental!</Text>
            <Text style={styles.enjoyBody}>Your rental period is active.</Text>
          </View>
          <QuickActionGrid onDetails={w.openAdvancedDetails} onMessages={w.openMessages} />
          <WizardItemCard {...itemCardProps} />
        </MeetupLifecycleShell>
      );

    case 'transition_return_reminder':
      return (
        <WizardTransitionShell
          title="Return reminder"
          headline="Your return window is tomorrow"
          subheadline="Take a few minutes to prepare the item, accessories, and return photos before meetup."
          icon="time-outline"
          onBack={() => router.back()}
          primaryLabel="Prepare for return"
          onPrimary={() => void w.advanceAfterTransition('transition_return_reminder')}
        >
          <BeforeReturnChecklist />
        </WizardTransitionShell>
      );

    case 'prepare_return':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={w.arrivalActionBusy ? 'Saving…' : "I'm here"}
          onPrimary={() => void w.markImHereReturn()}
          primaryDisabled={w.arrivalActionBusy}
          footerNote="Notify the owner that you've arrived."
        >
          <WizardItemCard {...itemCardProps} />
          <ReturnPhotoRows onAdd={() => w.openAdvancedDetails('return')} />
          <FinalChecklist />
        </WizardLightShell>
      );

    case 'owner_notified':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Message owner"
          onPrimary={w.openMessages}
          secondaryLabel="Update arrival details"
          onSecondary={() => w.openAdvancedDetails('return')}
        >
          <View style={styles.successHero}>
            <Ionicons name="notifications-outline" size={44} color="#818CF8" />
            <Text style={styles.successTitle}>The owner has been notified you're here!</Text>
            <Text style={styles.successBody}>They'll confirm once you're together.</Text>
          </View>
          <InfoPanel
            icon="location-outline"
            title="Return location"
            value={formatWizardLocation(ctx.rental.return_location, ctx.rental.meetup_location)}
          />
          <StatusBanner
            tone="info"
            title="You're all set"
            body="We'll update this screen as soon as the owner confirms."
          />
        </WizardLightShell>
      );

    case 'return_handoff':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Open return workspace"
          onPrimary={() => w.openAdvancedDetails('return')}
        >
          <StatusBanner tone="ready" title="You and the owner are together" body="" />
          <WizardItemCard {...itemCardProps} />
          <HandoffProgress />
        </WizardLightShell>
      );

    case 'transition_return_complete':
      return (
        <View style={styles.successScreen}>
          <WizardTransitionShell
            title="Return complete"
            headline="You're all set!"
            subheadline="Return complete 🎉"
            icon="checkmark-circle"
            iconTint="green"
            onBack={() => router.back()}
            primaryLabel="Leave review"
            onPrimary={() => void w.advanceAfterTransition('transition_return_complete')}
          >
            <SuccessInfoRows returnIso={ctx.returnIso} />
          </WizardTransitionShell>
        </View>
      );

    case 'leave_review':
      return <WizardLeaveReview rentalId={ctx.rentalId} displayTitle={ctx.displayTitle} />;

    default:
      return null;
  }
}

function InfoPanel({
  icon,
  title,
  value,
  actionLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  actionLabel?: string;
}) {
  return (
    <View style={styles.infoPanel}>
      <Ionicons name={icon} size={18} color={ui.primary} />
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      {actionLabel ? <Text style={styles.infoAction}>{actionLabel}</Text> : null}
    </View>
  );
}

function StatusBanner({
  tone,
  title,
  body,
}: {
  tone: 'waiting' | 'ready' | 'info';
  title: string;
  body: string;
}) {
  const bg =
    tone === 'ready' ? '#ECFDF5' : tone === 'waiting' ? '#EEF2FF' : '#F5F3FF';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons
        name={tone === 'ready' ? 'checkmark-circle' : 'time-outline'}
        size={18}
        color={tone === 'ready' ? '#16A34A' : ui.primary}
      />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        {body ? <Text style={styles.bannerBody}>{body}</Text> : null}
      </View>
    </View>
  );
}

function QuestionBox() {
  const [q, setQ] = useState('');
  return (
    <View style={styles.questionBox}>
      <Text style={styles.questionTitle}>Have any questions?</Text>
      <TextInput
        style={styles.questionInput}
        placeholder="Type your questions here..."
        placeholderTextColor="#94A3B8"
        multiline
        value={q}
        onChangeText={setQ}
        maxLength={500}
      />
      <Text style={styles.questionCount}>{`${q.length}/500`}</Text>
    </View>
  );
}

function ArrivalChecklist() {
  const items = [
    'Confirm the owner is present',
    'Review the item in person',
    'Confirm handoff to start the rental',
  ];
  return (
    <View style={styles.checklistCard}>
      <Text style={styles.checklistHead}>When you arrive</Text>
      {items.map((t) => (
        <View key={t} style={styles.checkRow}>
          <Ionicons name="checkmark-circle" size={18} color="#6366F1" />
          <Text style={styles.checkText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function EquipmentChecklist() {
  const items = [
    'I received the correct item',
    'Item condition matches photos',
    'All accessories are included',
    'I understand my responsibility',
  ];
  return (
    <View style={styles.checklistCard}>
      {items.map((t) => (
        <View key={t} style={styles.equipRow}>
          <Text style={styles.equipText}>{t}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      ))}
    </View>
  );
}

function QuickActionGrid({
  onDetails,
  onMessages,
}: {
  onDetails: () => void;
  onMessages: () => void;
}) {
  const actions = [
    { title: 'Need help?', icon: 'help-circle-outline' as const, onPress: onMessages },
    { title: 'Report a problem', icon: 'warning-outline' as const, onPress: onDetails },
    { title: 'Return details', icon: 'location-outline' as const, onPress: onDetails },
    { title: 'Share your rental', icon: 'share-outline' as const, onPress: onDetails },
  ];
  return (
    <View style={styles.quickGrid}>
      {actions.map((a) => (
        <Pressable
          key={a.title}
          pressOpacityFeedback={false}
          onPress={a.onPress}
          style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name={a.icon} size={20} color={ui.primary} />
          <Text style={styles.quickTitle}>{a.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function BeforeReturnChecklist() {
  const items = [
    'Recharge if needed',
    'Include all accessories',
    'Clean item if expected',
    'Take return photos day of return',
    'Arrive on time for meetup',
  ];
  return (
    <View style={styles.beforeReturn}>
      {items.map((t) => (
        <View key={t} style={styles.checkRow}>
          <Ionicons name="checkmark-circle" size={16} color="#A5B4FC" />
          <Text style={styles.checkTextDark}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function ReturnPhotoRows({ onAdd }: { onAdd: () => void }) {
  const rows = [
    { title: 'Overall condition', sub: 'Entire item in one photo', icon: 'camera-outline' as const },
    { title: 'Details / close-ups', sub: 'Any wear, scratches, or marks', icon: 'scan-outline' as const },
    { title: 'Accessories', sub: 'All included accessories', icon: 'albums-outline' as const },
  ];
  return (
    <View style={styles.photoSection}>
      <Text style={styles.sectionTitle}>Return photos</Text>
      <Text style={styles.sectionSub}>Take these photos right before you arrive.</Text>
      {rows.map((r) => (
        <View key={r.title} style={styles.photoRow}>
          <Ionicons name={r.icon} size={20} color={ui.textSecondary} />
          <View style={styles.photoRowText}>
            <Text style={styles.photoRowTitle}>{r.title}</Text>
            <Text style={styles.photoRowSub}>{r.sub}</Text>
          </View>
          <Pressable pressOpacityFeedback={false} onPress={onAdd} style={styles.addBtn}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function FinalChecklist() {
  return (
    <View style={styles.checklistCard}>
      <Text style={styles.checklistHead}>Final checklist</Text>
      <Text style={styles.checkText}>All accessories are included</Text>
      <Text style={styles.checkText}>Item is clean (if expected)</Text>
    </View>
  );
}

function HandoffProgress() {
  const rows = [
    { label: 'Overall condition', done: true },
    { label: 'Accessories', done: true },
    { label: 'Return photos', done: false },
  ];
  return (
    <View style={styles.checklistCard}>
      <Text style={styles.checklistHead}>Owner is reviewing the item</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.checkRow}>
          <Ionicons
            name={r.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={r.done ? '#16A34A' : '#94A3B8'}
          />
          <Text style={styles.checkText}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

function WizardActionRow({
  icon,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      pressOpacityFeedback={false}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.9 }]}
    >
      <Ionicons name={icon} size={20} color="#E0E7FF" />
      <View style={styles.actionRowText}>
        <Text style={styles.actionRowTitle}>{title}</Text>
        <Text style={styles.actionRowBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(226,232,240,0.6)" />
    </Pressable>
  );
}

function SuccessInfoRows({ returnIso }: { returnIso: string | null }) {
  return (
    <View style={styles.successInfo}>
      <Text style={styles.successInfoRow}>Return completed · {formatWizardDateTime(returnIso)}</Text>
      <Text style={styles.successInfoRow}>Responsibility period ended</Text>
      <Text style={styles.successInfoRow}>Preauthorization release started</Text>
    </View>
  );
}

function WizardLeaveReview({ rentalId, displayTitle }: { rentalId: string; displayTitle: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  return (
    <WizardLightShell
      title="Leave a review"
      onBack={() => router.back()}
      primaryLabel="Submit review"
      primaryDisabled={rating < 1}
      onPrimary={() => router.replace('/(tabs)/activity')}
    >
      <Text style={styles.reviewItem}>{displayTitle}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} pressOpacityFeedback={false} onPress={() => setRating(n)}>
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={32}
              color="#6366F1"
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.helper}>Your review helps build trust in the RenbyU community.</Text>
    </WizardLightShell>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, marginTop: 2 },
  infoAction: { fontSize: 13, fontWeight: '600', color: ui.primary },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  bannerBody: { fontSize: 13, color: ui.textSecondary, marginTop: 4, lineHeight: 18 },
  questionBox: { gap: 8 },
  questionTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  questionInput: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 12,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
  questionCount: { fontSize: 11, color: ui.textSecondary, alignSelf: 'flex-end' },
  checklistCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  checklistHead: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 14, color: ui.textPrimary, flex: 1 },
  checkTextDark: { fontSize: 14, color: 'rgba(226, 232, 240, 0.9)', flex: 1 },
  equipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  equipText: { fontSize: 15, fontWeight: '500', color: ui.textPrimary },
  successHero: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  successTitle: { fontSize: 20, fontWeight: '800', color: ui.textPrimary, textAlign: 'center' },
  successBody: { fontSize: 14, color: ui.textSecondary, textAlign: 'center', lineHeight: 20 },
  enjoyHero: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  enjoyTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  enjoyBody: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  activeHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  activeChip: {
    fontSize: 10,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  activeTitle: { fontSize: 22, fontWeight: '800', color: ui.textPrimary },
  activeSub: { fontSize: 14, color: ui.textSecondary, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickTile: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  quickTitle: { fontSize: 13, fontWeight: '600', color: ui.textPrimary },
  darkSummary: {
    width: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  darkSummaryLoc: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  darkSummaryTime: { color: 'rgba(199, 210, 254, 0.85)', fontSize: 13, marginTop: 4 },
  statusPill: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  statusPillText: { flex: 1, fontSize: 13, color: 'rgba(226, 232, 240, 0.9)', lineHeight: 18 },
  beforeReturn: { width: '100%', gap: 8, marginTop: 8 },
  photoSection: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  sectionSub: { fontSize: 13, color: ui.textSecondary, marginBottom: 4 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  photoRowText: { flex: 1 },
  photoRowTitle: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  photoRowSub: { fontSize: 12, color: ui.textSecondary },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: ui.primary },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    marginTop: 8,
  },
  actionRowText: { flex: 1 },
  actionRowTitle: { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  actionRowBody: { fontSize: 12, color: 'rgba(226, 232, 240, 0.75)', marginTop: 2 },
  successScreen: { flex: 1, backgroundColor: '#16A34A' },
  successInfo: { gap: 8, width: '100%', marginTop: 12 },
  successInfoRow: { fontSize: 13, color: 'rgba(226, 232, 240, 0.9)', textAlign: 'center' },
  reviewItem: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
