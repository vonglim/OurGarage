import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardChrome, primarySolidPressed, shadowKey, ui } from '@/constants/appUi';

export const MAIN_TAB_FAB_SIZE = 56;
export const MAIN_TAB_FAB_GAP = 16;

/**
 * Scroll / list bottom padding so content stays above the FAB (which sits above the tab bar).
 */
export function useMainTabFabBottomReserve(): number {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  return tabBarHeight + MAIN_TAB_FAB_SIZE + MAIN_TAB_FAB_GAP + Math.max(insets.bottom, 8);
}

/**
 * Floating + button with “Request equipment” / “List equipment”. Render on Home, Browse, and Activity.
 */
export function MainTabFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        pressOpacityFeedback={false}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Add request or list equipment"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: tabBarHeight + MAIN_TAB_FAB_GAP,
            right: 20,
          },
          pressed && styles.fabPressed,
        ]}
      >
        <Ionicons name="add" size={32} color={ui.primaryOn} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, { paddingBottom: tabBarHeight + insets.bottom + 16 }]}
          onPress={() => setOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Create</Text>
            <Pressable
              style={({ pressed }) => [styles.modalRow, pressed && styles.modalRowPressed]}
              onPress={() => {
                setOpen(false);
                router.push('/request-a-tool');
              }}
            >
              <Ionicons name="construct-outline" size={22} color={ui.primary} />
              <Text style={styles.modalRowText}>Request equipment</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalRow, pressed && styles.modalRowPressed]}
              onPress={() => {
                setOpen(false);
                router.push('/list-my-tool');
              }}
            >
              <Ionicons name="cube-outline" size={22} color={ui.primary} />
              <Text style={styles.modalRowText}>List equipment</Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: MAIN_TAB_FAB_SIZE,
    height: MAIN_TAB_FAB_SIZE,
    borderRadius: MAIN_TAB_FAB_SIZE / 2,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowKey,
    elevation: 6,
  },
  fabPressed: {
    ...primarySolidPressed,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: ui.padScreenH,
  },
  modalCard: {
    ...cardChrome,
    paddingTop: 12,
    paddingBottom: 6,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  modalRowPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  modalRowText: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  modalCancel: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.textSecondary,
  },
});
