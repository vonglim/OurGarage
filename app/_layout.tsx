import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import 'react-native-reanimated';

import { NumberPadKeyboardAccessory } from './components/NumberPadKeyboardAccessory';
import { registerAndStorePushTokenAsync } from './lib/notifications';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void registerAndStorePushTokenAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1 }}>
            <NumberPadKeyboardAccessory />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="onboarding-terms" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="request-a-tool" />
              <Stack.Screen name="list-my-tool" />
              <Stack.Screen name="rental-agreement" />
              <Stack.Screen name="request-details" />
              <Stack.Screen name="match-summary" />
              <Stack.Screen name="chat/[id]" />
              <Stack.Screen name="handoff-confirmation" />
              <Stack.Screen name="edit-profile" />
              <Stack.Screen name="rentals-management" />
              <Stack.Screen name="requests-management" />
              <Stack.Screen name="request-confirmation" />
              <Stack.Screen name="leave-review" />
              <Stack.Screen name="end-rental" />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
          </View>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
