import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { wizardCopy, wizardSubtitleOuterStyle, wizardSubtitleTextStyle } from '@/constants/wizardCopy';

type WizardSubtitleProps = {
  children: React.ReactNode;
  textStyle?: StyleProp<TextStyle>;
  /** Extra space before the next block (e.g. above a dense form). */
  bottomLoose?: boolean;
  /** Optional outer wrapper tweaks (e.g. review hint sizing). */
  outerStyle?: StyleProp<ViewStyle>;
};

export function WizardSubtitle({ children, textStyle, bottomLoose, outerStyle }: WizardSubtitleProps) {
  return (
    <View
      style={[
        styles.outer,
        bottomLoose && { marginBottom: wizardCopy.subtitleToContentLoose },
        outerStyle,
      ]}
    >
      <Text style={[wizardSubtitleTextStyle, textStyle]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: wizardSubtitleOuterStyle,
});
