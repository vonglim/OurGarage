import React from 'react';
import {
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps['pointerEvents'];
};

/**
 * Screen wrapper that preserves natural scroll gestures everywhere.
 * Keyboard dismissal is handled by individual screens/inputs.
 */
export function KeyboardDismissScreen({ children, style, pointerEvents }: Props) {
  return (
    <View style={[{ flex: 1, minHeight: 0 }, style]} pointerEvents={pointerEvents}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {children}
      </View>
    </View>
  );
}