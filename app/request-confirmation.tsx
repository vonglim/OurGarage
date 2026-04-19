import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { ui } from '@/constants/appUi';

export default function RequestConfirmation() {
  const router = useRouter();

  return (
    <KeyboardDismissScreen style={styles.container}>
      <Text style={styles.title}>Request Submitted 🎉</Text>

      <Text style={styles.text}>
        We’ll notify neighbors with equipment nearby. You’ll start getting responses soon.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.push('/home')}
      >
        <Text style={styles.buttonText}>Back To Home</Text>
      </Pressable>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
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
    opacity: ui.pressOpacity,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});