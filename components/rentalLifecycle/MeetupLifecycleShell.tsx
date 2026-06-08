import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetupLifecycleProgressHeader } from '@/components/rentalLifecycle/MeetupLifecycleProgressHeader';
import { Pressable } from '@/components/Pressable';
import type { MeetupLifecyclePhase } from '@/lib/rentalLifecycle/meetupLifecycle';
import type { MeetupLifecycleProgressIndex } from '@/lib/rentalLifecycle/meetupLifecycle';
import { MEETUP_LIFECYCLE_THEME } from '@/lib/rentalLifecycle/meetupLifecycleTheme';

export type MeetupLifecycleShellProps = {
  phase: MeetupLifecyclePhase;
  progressIndex: MeetupLifecycleProgressIndex;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onOpenMessages?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footerNote?: string;
  children: React.ReactNode;
};

export function MeetupLifecycleShell({
  phase,
  progressIndex,
  title,
  subtitle,
  onBack,
  onOpenMessages,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryBusy = false,
  secondaryLabel,
  onSecondary,
  footerNote,
  children,
}: MeetupLifecycleShellProps) {
  const insets = useSafeAreaInsets();
  const theme = MEETUP_LIFECYCLE_THEME[phase];

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: '#F8FAFC' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {onBack ? (
          <Pressable pressOpacityFeedback={false} onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {onOpenMessages ? (
          <Pressable pressOpacityFeedback={false} onPress={onOpenMessages} style={styles.iconBtn}>
            <Ionicons name="chatbubble-outline" size={22} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MeetupLifecycleProgressHeader activePhase={phase} progressIndex={progressIndex} />
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
        <Pressable
          pressOpacityFeedback={false}
          haptic
          disabled={primaryDisabled || primaryBusy}
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.primary },
            pressed && { backgroundColor: theme.primaryPressed },
            (primaryDisabled || primaryBusy) && styles.btnDisabled,
          ]}
        >
          {primaryBusy ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: theme.onPrimary }]}>{primaryLabel}</Text>
          )}
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable pressOpacityFeedback={false} onPress={onSecondary} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    marginBottom: 16,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  footerNote: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 10 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  btnDisabled: { opacity: 0.45 },
});
