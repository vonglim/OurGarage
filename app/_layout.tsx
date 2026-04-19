import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import 'react-native-reanimated';

import { STACK_TRANSITION_DURATION_MS } from '@/constants/navigation';
import { FeedbackToastHost } from './components/FeedbackToastHost';
import { NumberPadKeyboardAccessory } from './components/NumberPadKeyboardAccessory';
import { registerAndStorePushTokenAsync } from './lib/notifications';
import { useNotificationsStore } from './store/notificationsStore';
import { seedTestData as seedOffersTestData } from './store/offersStore';
import { seedTestData as seedListingsTestData } from './store/listingsStore';
import { seedTestData as seedRequestsTestData } from './store/requestsStore';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { lightImpact } from '@/lib/haptics';

function NavigationHaptics() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);
  useEffect(() => {
    if (prevPath.current !== null && prevPath.current !== pathname) {
      lightImpact();
    }
    prevPath.current = pathname;
  }, [pathname]);
  return null;
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void registerAndStorePushTokenAsync();
  }, []);

  useEffect(() => {
    void useNotificationsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    seedRequestsTestData();
    seedOffersTestData();
    seedListingsTestData();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1 }}>
            <NavigationHaptics />
            <NumberPadKeyboardAccessory />
            <Stack
              screenOptions={{
                headerShown: false,
                animationDuration: STACK_TRANSITION_DURATION_MS,
              }}
            >
              <Stack.Screen name="onboarding-terms" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="request-a-tool" />
              <Stack.Screen name="list-my-tool" />
              <Stack.Screen name="rental-agreement" />
              <Stack.Screen name="request-details" />
              <Stack.Screen name="listing-detail" />
              <Stack.Screen name="offer-detail" />
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
            <FeedbackToastHost />
          </View>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
