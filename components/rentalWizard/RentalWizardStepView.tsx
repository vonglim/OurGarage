import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardTransitionShell } from '@/components/rentalWizard/shells/WizardTransitionShell';
import { WizardDarkMeetupCards } from '@/components/rentalWizard/shared/WizardMeetupCards';
import { ui } from '@/constants/appUi';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import type { RentalWizardStep } from '@/lib/rentalWizard/types';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

export type RentalWizardStepViewProps = {
  step: RentalWizardStep;
};

export function RentalWizardStepView({ step }: RentalWizardStepViewProps) {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const meta = WIZARD_STEP_META[step];
  const ownerLine = `${ctx.ownerDisplayName} · Owner`;

  switch (step) {
    case 'coordinate_pickup':
      return (
        <WizardLightShell
          title={meta.title}
          subtitle="Agree on how and where you'll get the item from the owner."
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={ctx.meetingCompleted ? 'Continue' : 'Set pickup in workspace'}
          onPrimary={() =>
            ctx.meetingCompleted ? void w.goToResolvedNext() : w.openAdvancedDetails('meeting')
          }
          secondaryLabel="Open messages"
          onSecondary={w.openMessages}
          footerNote="The owner will be notified of your proposal."
        >
          <WizardItemCard
            title={ctx.displayTitle}
            ownerLine={ownerLine}
            rentalCode={ctx.rentalCodeLabel}
          />
          <InfoPanel
            icon="location-outline"
            title="Pickup location"
            value={formatWizardLocation(ctx.rental.meetup_location)}
          />
          <InfoPanel
            icon="calendar-outline"
            title="Pickup time"
            value={formatWizardDateTime(ctx.pickupIso)}
          />
          {!ctx.meetingCompleted ? (
            <Text style={styles.helper}>
              Use the full rental workspace to propose or accept meetup times. Your guided flow will
              pick up right where you left off.
            </Text>
          ) : null}
        </WizardLightShell>
      );

    case 'transition_pickup_confirmed':
      return (
        <WizardTransitionShell
          title="Pickup confirmed"
          headline="Great! Pickup location and handoff time set."
          subheadline="You're all set for pickup. Now let's coordinate a return time and location."
          onBack={() => router.back()}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_pickup_confirmed')}
        >
          <View style={styles.darkSummary}>
            <Text style={styles.darkSummaryLoc}>
              {formatWizardLocation(ctx.rental.meetup_location)}
            </Text>
            <Text style={styles.darkSummaryTime}>{formatWizardDateTime(ctx.pickupIso)}</Text>
          </View>
        </WizardTransitionShell>
      );

    case 'coordinate_return':
      return (
        <WizardLightShell
          title={meta.title}
          subtitle="Agree on when and where you'll return the item to the owner."
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={ctx.meetingCompleted ? 'Continue' : 'Set return in workspace'}
          onPrimary={() =>
            ctx.meetingCompleted ? void w.goToResolvedNext() : w.openAdvancedDetails('meeting')
          }
          secondaryLabel="Open messages"
          onSecondary={w.openMessages}
          footerNote="The owner will be notified of your proposal."
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
          <InfoPanel
            icon="location-outline"
            title="Return location"
            value={formatWizardLocation(ctx.rental.return_location, ctx.rental.meetup_location)}
          />
          <InfoPanel
            icon="calendar-outline"
            title="Return time"
            value={formatWizardDateTime(ctx.returnIso)}
          />
        </WizardLightShell>
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
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={
            ctx.ownerPickupPhotoCount > 0 ? 'Approve photos' : 'Waiting for owner photos'
          }
          primaryDisabled={ctx.ownerPickupPhotoCount === 0}
          onPrimary={() => void w.markPhotosApproved()}
          footerNote="You'll be able to review and approve the photos before meetup."
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
          <StatusBanner
            tone={ctx.ownerPickupPhotoCount > 0 ? 'ready' : 'waiting'}
            title={ctx.ownerPickupPhotoCount > 0 ? 'Photos ready for review' : 'Waiting on owner'}
            body={
              ctx.ownerPickupPhotoCount > 0
                ? 'The owner uploaded fresh photos of the exact item. Review them in the rental workspace, then approve here.'
                : 'The owner will upload fresh photos of the exact item before pickup.'
            }
          />
          <QuestionBox />
        </WizardLightShell>
      );

    case 'transition_pickup_ready':
      return (
        <WizardTransitionShell
          title="Pickup ready"
          headline="You're ready for pickup!"
          subheadline="Pickup is confirmed and the owner has completed their preparation."
          iconTint="green"
          icon="checkmark-circle"
          onBack={() => router.back()}
          primaryLabel="I'm here"
          onPrimary={async () => {
            await w.advanceAfterTransition('transition_pickup_ready');
            await w.markImHerePickup();
          }}
        >
          <WizardDarkMeetupCards ctx={ctx} />
          <View style={styles.statusPill}>
            <Ionicons name="time-outline" size={16} color="#A5B4FC" />
            <Text style={styles.statusPillText}>
              We'll notify you when the owner arrives. See you there!
            </Text>
          </View>
        </WizardTransitionShell>
      );

    case 'meetup_day':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="I'm here"
          onPrimary={() => void w.markImHerePickup()}
          secondaryLabel="Message owner"
          onSecondary={w.openMessages}
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
          <InfoPanel
            icon="location-outline"
            title="Meetup location"
            value={formatWizardLocation(ctx.rental.meetup_location)}
            actionLabel="View map"
          />
          <InfoPanel icon="calendar-outline" title="Pickup time" value={formatWizardDateTime(ctx.pickupIso)} />
          <ArrivalChecklist />
        </WizardLightShell>
      );

    case 'owner_confirmed_arrival':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Equipment confirmation"
          onPrimary={() => void w.goToResolvedNext()}
          secondaryLabel="Message owner"
          onSecondary={w.openMessages}
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
          <View style={styles.successHero}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
            <Text style={styles.successTitle}>The owner is here!</Text>
            <Text style={styles.successBody}>
              The owner has confirmed their arrival. You can now continue with equipment confirmation.
            </Text>
          </View>
          <StatusBanner
            tone="info"
            title="Take your time"
            body="Inspect the item in person before confirming."
          />
        </WizardLightShell>
      );

    case 'equipment_confirmation':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Sign & continue"
          onPrimary={() => w.openAdvancedDetails('pickup')}
          secondaryLabel="Message owner"
          onSecondary={w.openMessages}
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
          <EquipmentChecklist />
        </WizardLightShell>
      );

    case 'transition_enjoy_rental':
      return (
        <WizardTransitionShell
          title="Enjoy your rental"
          headline="Enjoy your rental!"
          subheadline={`Your rental is now active. Return by ${formatWizardDateTime(ctx.returnIso)}.`}
          icon="sparkles"
          onBack={() => router.back()}
          primaryLabel="View rental"
          onPrimary={() => void w.advanceAfterTransition('transition_enjoy_rental')}
        >
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
        </WizardTransitionShell>
      );

    case 'active_rental':
      return (
        <WizardLightShell
          title={meta.title}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Open rental workspace"
          onPrimary={() => w.openAdvancedDetails()}
          secondaryLabel="Request extension"
          onSecondary={w.openAdvancedDetails}
        >
          <View style={styles.activeHero}>
            <Text style={styles.activeChip}>ACTIVE</Text>
            <Text style={styles.activeTitle}>Enjoy your rental!</Text>
            <Text style={styles.activeSub}>Return due {formatWizardDateTime(ctx.returnIso)}</Text>
          </View>
          <QuickActionGrid onDetails={w.openAdvancedDetails} onMessages={w.openMessages} />
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
        </WizardLightShell>
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
          primaryLabel="I'm here"
          onPrimary={() => void w.markImHereReturn()}
          footerNote="Notify the owner that you've arrived."
        >
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
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
          <WizardItemCard title={ctx.displayTitle} ownerLine={ownerLine} rentalCode={ctx.rentalCodeLabel} />
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
