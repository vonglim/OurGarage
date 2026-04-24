import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type NativeSafeAreaViewProps } from 'react-native-safe-area-context';

export type ScreenWrapperProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  /** Defaults to top, left, and right so callers keep bottom padding for tab bars / scroll content. */
  edges?: NativeSafeAreaViewProps['edges'];
};

export function ScreenWrapper({
  children,
  style,
  innerStyle,
  edges = ['top', 'left', 'right'],
}: ScreenWrapperProps) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <View style={[styles.inner, innerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  inner: {
    flex: 1,
  },
});
