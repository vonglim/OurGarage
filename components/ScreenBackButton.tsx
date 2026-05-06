import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/Pressable';

const ICON_SIZE = 22;

export type ScreenBackButtonProps = {
  onPress: () => void;
  /** `overlay`: absolute top-left for heroes / imagery; `inline`: header row flow */
  variant?: 'overlay' | 'inline';
  style?: StyleProp<ViewStyle>;
  /** Defaults to light haptics on overlay only */
  haptic?: boolean;
  iconSize?: number;
};

export function ScreenBackButton({
  onPress,
  variant = 'inline',
  style,
  haptic,
  iconSize = ICON_SIZE,
}: ScreenBackButtonProps) {
  const useHaptic = haptic ?? variant === 'overlay';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={
        variant === 'overlay'
          ? { top: 8, bottom: 8, left: 8, right: 8 }
          : { top: 10, bottom: 10, left: 8, right: 8 }
      }
      haptic={useHaptic}
      pressOpacityFeedback={false}
      style={({ pressed }) => [
        styles.pill,
        variant === 'overlay' ? styles.overlayPosition : styles.inlinePosition,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={iconSize} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.48)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.38,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 10 : Platform.OS === 'ios' ? 0 : 4,
  },
  overlayPosition: {
    position: 'absolute',
    top: 10,
    left: 16,
    zIndex: 50,
  },
  inlinePosition: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
});
