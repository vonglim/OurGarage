import React, { type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type StickyActionBarProps = {
  children: ReactNode;
  bottomInset: number;
  /** Extra vertical padding above safe inset */
  contentPaddingTop?: number;
};

/**
 * Fixed bottom bar for primary transactional actions (offer, rental, confirmations).
 */
export function StickyActionBar({
  children,
  bottomInset,
  contentPaddingTop = 12,
}: StickyActionBarProps) {
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: contentPaddingTop,
          paddingBottom: contentPaddingTop + bottomInset,
        },
      ]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: ui.padScreenH,
    backgroundColor: ui.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      default: {
        elevation: 12,
      },
    }),
  },
});
