import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardCancellationBannerSlot } from '@/components/rentalCancellation/WizardCancellationBannerSlot';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { GuidedWizardChrome } from '@/components/wizard/GuidedWizardChrome';
import { wizardLayout, wizardSectionStackStyle } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardLightShellProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onOpenMessages?: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footerNote?: string;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function WizardLightShell({
  title,
  subtitle,
  onBack,
  onOpenMessages,
  primaryLabel,
  primaryDisabled = false,
  onPrimary,
  secondaryLabel,
  onSecondary,
  footerNote,
  children,
  contentContainerStyle,
}: WizardLightShellProps) {
  return (
    <ScreenWrapper style={styles.screen} innerStyle={styles.screenInner}>
      <GuidedWizardChrome
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        footerLabel={primaryLabel}
        footerDisabled={primaryDisabled}
        onFooterPress={onPrimary}
        footerNote={footerNote}
        secondaryFooterLabel={secondaryLabel}
        onSecondaryFooterPress={onSecondary}
        contentContainerStyle={contentContainerStyle}
        bodyStyle={wizardSectionStackStyle}
        rightAccessory={
          onOpenMessages ? (
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onOpenMessages}
              accessibilityLabel="Open messages"
              style={({ pressed }) => [styles.msgBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={ui.primary} />
            </Pressable>
          ) : undefined
        }
      >
        <WizardCancellationBannerSlot />
        {children}
      </GuidedWizardChrome>
    </ScreenWrapper>
  );
}

const styles = {
  screen: { flex: 1, backgroundColor: ui.background },
  screenInner: { flex: 1 },
  msgBtn: { padding: 8 },
};
