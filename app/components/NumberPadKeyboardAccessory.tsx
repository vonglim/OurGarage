import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/** Shared id for iOS `inputAccessoryViewID` on numeric fields (number-pad / decimal-pad). */
export const NUMBER_PAD_ACCESSORY_ID = 'ourgarage-numeric-done';

export function numberPadAccessoryProps(): { inputAccessoryViewID?: string } {
  return Platform.OS === 'ios' ? { inputAccessoryViewID: NUMBER_PAD_ACCESSORY_ID } : {};
}

/**
 * iOS toolbar above number-pad / decimal-pad keyboards (no built-in Done key).
 * Android: omit; rely on back, tap-outside (KeyboardDismissScreen), or IME done where shown.
 */
export function NumberPadKeyboardAccessory() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={NUMBER_PAD_ACCESSORY_ID}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={12}
          style={styles.doneHit}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#E5E5EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneHit: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
});
