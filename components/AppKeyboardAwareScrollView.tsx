import React, { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

export type AppKeyboardAwareScrollViewProps = ScrollViewProps & {
  /** Space between keyboard top and focused caret (see react-native-keyboard-controller). */
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  enabled?: boolean;
};

/**
 * App-wide keyboard-aware scroll: keeps focused inputs visible on iOS/Android.
 * On web, falls back to a plain ScrollView (no native keyboard controller).
 */
export const AppKeyboardAwareScrollView = forwardRef<ScrollView, AppKeyboardAwareScrollViewProps>(
  function AppKeyboardAwareScrollView(
    {
      bottomOffset = 18,
      extraKeyboardSpace = 0,
      enabled = true,
      keyboardShouldPersistTaps = 'handled',
      ...rest
    },
    ref
  ) {
    if (Platform.OS === 'web') {
      return <ScrollView ref={ref} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest} />;
    }
    return (
      <KeyboardAwareScrollView
        ref={ref}
        bottomOffset={bottomOffset}
        extraKeyboardSpace={extraKeyboardSpace}
        enabled={enabled}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...rest}
      />
    );
  }
);
