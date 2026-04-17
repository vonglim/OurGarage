import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: 20 + insets.top, paddingBottom: 24 + insets.bottom },
      ]}
    >
      <Text style={styles.title}>OurGarage</Text>

      <View style={styles.focusSection}>
        <TextInput
          placeholder="What tool do you need?"
          placeholderTextColor="#8E8E93"
          style={styles.searchInput}
          autoCapitalize="sentences"
          autoCorrect
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          onPress={() => router.push('/requests')}
        >
          <Text style={styles.primaryButtonText}>Request A Tool</Text>
        </Pressable>
      </View>

      <Text style={styles.secondaryText}>Have a tool? Rent it out</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 40,
    color: '#000', // Ensure visible on white background
  },
  focusSection: {
    width: '100%',
    maxWidth: 400,
  },
  searchInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#C7C7CC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: '#F2F2F7',
    marginBottom: 14,
    color: '#000', // Ensure visible on white
  },
  primaryButton: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: ui.pressOpacity,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryText: {
    marginTop: 28,
    fontSize: 15,
    color: '#000', // Ensure visible on white
    fontWeight: '400',
  },
});
