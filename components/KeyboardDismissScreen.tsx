import React from 'react';
import {
  Keyboard,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Tap non-interactive areas to dismiss the keyboard. Uses `accessible={false}` so
 * scroll views and buttons keep normal behavior when combined with `keyboardShouldPersistTaps="handled"`.
 */
export function KeyboardDismissScreen({ children, style }: Props) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </TouchableWithoutFeedback>
  );
}
