import { usePathname } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RentalDevToolkitPanel } from '@/components/devtools/RentalDevToolkitPanel';
import { Pressable as AppPressable } from '@/components/Pressable';
import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import {
  mockChatSnippet,
  mockDeclineReason,
  mockIssueReportBody,
} from '@/lib/devTools/mockGenerators';
import { resetLocalMessagingState } from '@/lib/resetLocalAppState';
import { useDevToolsStore } from '@/store/devToolsStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { ui } from '@/constants/appUi';

/**
 * Floating dev-only QA menu. Renders nothing when {@link DEV_TOOLS_ENABLED} is false.
 */
export function DevToolsFab() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [generalOpen, setGeneralOpen] = useState(false);
  const [rentalToolkitOpen, setRentalToolkitOpen] = useState(false);

  const pageAutofill = useDevToolsStore((s) => s.pageAutofill);
  const pageLabel = useDevToolsStore((s) => s.pageLabel);

  if (!DEV_TOOLS_ENABLED) return null;

  const fabBottomOffset =
    pathname.includes('offer-detail') ? 76 + insets.bottom : Math.max(insets.bottom, 12) + 8;

  const isRentalContext =
    pathname.includes('/rental/') || pathname.includes('/rental-wizard/');

  const runAutofill = () => {
    if (!pageAutofill) {
      showFeedbackToast('No autofill registered for this screen');
      return;
    }
    try {
      pageAutofill();
    } catch (e) {
      if (__DEV__) console.warn('[dev-tools] autofill failed', e);
      showFeedbackToast('Autofill failed (see console)');
    }
  };

  const onMockMessage = () => {
    const text = mockChatSnippet();
    if (__DEV__) console.log('[dev-tools] mock message:\n', text);
    showFeedbackToast('Mock message logged to console');
  };

  const onMockDecline = () => {
    const t = mockDeclineReason();
    if (__DEV__) console.log('[dev-tools] mock decline:\n', t);
    showFeedbackToast('Mock decline text in console');
  };

  const onMockIssue = () => {
    const t = mockIssueReportBody();
    if (__DEV__) console.log('[dev-tools] mock issue:\n', t);
    showFeedbackToast('Mock issue body in console');
  };

  const onClearLocal = async () => {
    await resetLocalMessagingState('dev_tools_fab');
    showFeedbackToast('Local messaging cache cleared');
  };

  return (
    <>
      <AppPressable
        pressOpacityFeedback={false}
        accessibilityLabel="Open developer tools"
        onPress={() => {
          if (isRentalContext) setRentalToolkitOpen(true);
          else setGeneralOpen(true);
        }}
        onLongPress={() => {
          setRentalToolkitOpen(true);
        }}
        style={[
          styles.fab,
          {
            bottom: fabBottomOffset,
            right: Math.max(insets.right, 12),
          },
        ]}
      >
        <Text style={styles.fabText}>⚡ DEV</Text>
      </AppPressable>

      <RentalDevToolkitPanel
        visible={rentalToolkitOpen}
        onClose={() => setRentalToolkitOpen(false)}
        pathname={pathname}
      />

      <Modal visible={generalOpen} transparent animationType="fade" onRequestClose={() => setGeneralOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGeneralOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <Text style={styles.sheetTitle}>Developer tools</Text>
            <Text style={styles.sheetMeta} numberOfLines={2}>
              {pathname}
              {pageLabel ? ` · ${pageLabel}` : ''}
            </Text>

            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <SheetBtn
                title="Open rental lifecycle toolkit"
                subtitle="Jumps, simulation clock, wizard debug"
                onPress={() => {
                  setGeneralOpen(false);
                  setRentalToolkitOpen(true);
                }}
              />
              <SheetBtn
                title="Autofill current page"
                subtitle={
                  pageAutofill ? 'Runs screen-registered fill only' : 'No autofill available for this screen yet.'
                }
                onPress={runAutofill}
                disabled={!pageAutofill}
              />
              <SheetBtn title="Log mock chat snippet" subtitle="Console + toast" onPress={onMockMessage} />
              <SheetBtn title="Log mock decline reason" subtitle="For offer/decline flows" onPress={onMockDecline} />
              <SheetBtn title="Log mock issue report" subtitle="Support-style body" onPress={onMockIssue} />
              <SheetBtn
                title="Clear local messaging cache"
                subtitle="Chats/notifications AsyncStorage (dev)"
                onPress={() => void onClearLocal()}
              />
            </ScrollView>

            <AppPressable
              pressOpacityFeedback={false}
              onPress={() => setGeneralOpen(false)}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </AppPressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function SheetBtn({
  title,
  subtitle,
  onPress,
  disabled,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <AppPressable
      pressOpacityFeedback={false}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowBtn,
        disabled && styles.rowBtnDisabled,
        pressed && !disabled && styles.rowBtnPressed,
      ]}
    >
      <Text style={[styles.rowBtnTitle, disabled && styles.rowBtnTitleDisabled]}>{title}</Text>
      {subtitle ? <Text style={styles.rowBtnSub}>{subtitle}</Text> : null}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    zIndex: 9999,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: '88%',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  sheetMeta: {
    marginTop: 6,
    fontSize: 12,
    color: ui.textSecondary,
  },
  sheetScroll: {
    marginTop: 14,
    maxHeight: 420,
  },
  rowBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  rowBtnPressed: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  rowBtnDisabled: {
    opacity: 0.45,
  },
  rowBtnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  rowBtnTitleDisabled: {
    color: ui.textMuted,
  },
  rowBtnSub: {
    marginTop: 4,
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
});
