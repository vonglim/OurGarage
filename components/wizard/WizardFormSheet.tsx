import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardFormSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Hide the left Cancel action — swipe-down, backdrop tap, and X still dismiss. */
  hideCancelButton?: boolean;
};

const DISMISS_DRAG_PX = 72;

export function WizardFormSheet({
  visible,
  title,
  onClose,
  children,
  footer,
  sheetStyle,
  hideCancelButton = false,
}: WizardFormSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const dismiss = () => {
    Keyboard.dismiss();
    onClose();
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG_PX || e.velocityY > 900) {
        runOnJS(dismiss)();
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 280 });
    });

  const sheetAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.root}>
        <RNPressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          <Animated.View
            style={[
              styles.sheet,
              sheetAnim,
              {
                paddingBottom: Math.max(insets.bottom, wizardLayout.sheetBottomMin),
              },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>
              <View style={styles.header}>
                {hideCancelButton ? (
                  <View style={styles.headerSide} />
                ) : (
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={dismiss}
                    style={styles.headerSide}
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
                <Text style={styles.title} numberOfLines={2}>
                  {title}
                </Text>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={dismiss}
                  style={[styles.headerSide, styles.headerSideEnd]}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={ui.textSecondary} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                bounces
                contentContainerStyle={styles.scrollContent}
              >
                {children}
              </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  keyboardAvoid: {
    width: '100%',
    maxHeight: '92%',
    flexShrink: 1,
  },
  sheet: {
    backgroundColor: ui.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '100%',
    flexShrink: 1,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wizardLayout.sheetPaddingHorizontal,
    paddingBottom: wizardLayout.sheetHeaderPaddingBottom,
    gap: 8,
  },
  headerSide: {
    minWidth: 64,
    paddingVertical: 4,
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: wizardLayout.sheetPaddingHorizontal,
    paddingBottom: wizardLayout.sheetScrollPaddingBottom,
    gap: wizardLayout.sheetContentGap,
  },
  footer: {
    paddingHorizontal: wizardLayout.sheetPaddingHorizontal,
    paddingTop: wizardLayout.sheetFooterPaddingTop,
    gap: wizardLayout.sheetContentGap,
  },
});
