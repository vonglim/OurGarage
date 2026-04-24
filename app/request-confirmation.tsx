import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { primarySolidPressed, ui } from '@/constants/appUi';

export default function RequestConfirmation() {
  const router = useRouter();

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.container}>
        <ScreenEntrance style={styles.entranceContent}>
        <Text style={styles.title}>Request Submitted 🎉</Text>

        <Text style={styles.text}>
          We’ll notify neighbors with equipment nearby. You’ll start getting responses soon.
        </Text>

        <Pressable
          pressOpacityFeedback={false}
          haptic
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push('/home')}
        >
          <Text style={styles.buttonText}>Back To Home</Text>
        </Pressable>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 0,
    backgroundColor: ui.background,
  },
  entranceContent: {
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    color: ui.textSubtle,
    marginBottom: 30,
    lineHeight: 24,
  },
  button: {
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    paddingHorizontal: 24,
    borderRadius: ui.radiusButton,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonPressed: {
    ...primarySolidPressed,
  },
  buttonText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
});