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
 * Tap outside to dismiss keyboard without interfering with ScrollView gestures.
 */
export function KeyboardDismissScreen({ children, style }: Props) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}