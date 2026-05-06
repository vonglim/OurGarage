import React from 'react';
import {
  Keyboard,
  TouchableWithoutFeedback,
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
 * Tap outside to dismiss keyboard without interfering with ScrollView gestures.
 */
export function KeyboardDismissScreen({ children, style, pointerEvents }: Props) {
  return (
    <View style={[{ flex: 1, minHeight: 0 }, style]} pointerEvents={pointerEvents}>
      <TouchableWithoutFeedback
        onPress={() => {
          console.log('[TOUCH DEBUG] KeyboardDismissScreen onPress');
          Keyboard.dismiss();
        }}
        accessible={false}
      >
        <View style={{ flex: 1, minHeight: 0 }}>
          {children}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}