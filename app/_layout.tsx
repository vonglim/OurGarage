import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import type { Session } from '@supabase/supabase-js';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeedbackToastHost } from '@/components/FeedbackToastHost';
import { CreateUsernameScreen } from '@/components/CreateUsernameScreen';
import { LoginScreen } from '@/components/LoginScreen';
import { NumberPadKeyboardAccessory } from '@/components/NumberPadKeyboardAccessory';
import { STACK_TRANSITION_DURATION_MS } from '@/constants/navigation';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { lightImpact } from '@/lib/haptics';
import { ensureProfile } from '@/lib/ensureProfile';
import { startNotificationsServerSync } from '@/lib/notificationsServerSync';
import { registerAndStorePushTokenAsync } from '@/lib/notifications';
import { clearRemoteProfileCache } from '@/lib/remoteProfileCache';
import { supabase } from '../lib/supabase';
import { applySessionToAuthStore } from '@/store/authSessionStore';
import { resetProfileToDefault } from '@/store/profileStore';

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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsCreateUsername, setNeedsCreateUsername] = useState(false);

  useEffect(() => {
    const syncProfileAndSession = async (next: Session | null) => {
      applySessionToAuthStore(next);
      if (next?.user) {
        const pr = await ensureProfile(next.user);
        if (__DEV__) {
          console.log('PROFILE CHECK:', {
            userId: next.user.id,
            needsCreateUsername: pr?.needsCreateUsername,
            profileName: pr?.name,
            result: pr,
          });
        }
        setNeedsCreateUsername(pr?.needsCreateUsername === true);
      } else {
        setNeedsCreateUsername(false);
        clearRemoteProfileCache();
        resetProfileToDefault();
      }
      setSession(next);
    };

    void (async () => {
      try {
        const {
          data: { session: next },
        } = await supabase.auth.getSession();
        await syncProfileAndSession(next);
      } catch {
        await syncProfileAndSession(null);
      } finally {
        setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }
      void (async () => {
        await syncProfileAndSession(next);
      })();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (needsCreateUsername) return;
    if (!session?.user?.id) return;
    return startNotificationsServerSync(session.user.id);
  }, [loading, needsCreateUsername, session?.user?.id]);

  useEffect(() => {
    if (loading) return;
    if (needsCreateUsername) return;
    if (!session) return;
    if (Platform.OS !== 'web') {
      void registerAndStorePushTokenAsync();
    }
  }, [loading, needsCreateUsername, session]);

  if (loading) return null;

  if (!session) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  if (needsCreateUsername && session.user) {
    return (
      <SafeAreaProvider>
        <CreateUsernameScreen
          user={session.user}
          onCompleted={() => setNeedsCreateUsername(false)}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <View style={{ flex: 1 }}>
            <NavigationHaptics />
            <NumberPadKeyboardAccessory />
            <Stack
              screenOptions={({ route }) => {
                const isTabsRoot = route.name === '(tabs)';
                return {
                  headerShown: false,
                  animationDuration: STACK_TRANSITION_DURATION_MS,
                  gestureEnabled: !isTabsRoot,
                  fullScreenGestureEnabled: !isTabsRoot,
                };
              }}
            >
              <Stack.Screen name="onboarding-terms" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="request"
                options={{
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              />
              <Stack.Screen
                name="rent-out"
                options={{
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              />
              <Stack.Screen name="list-my-tool" />
              <Stack.Screen name="create-listing" />
              <Stack.Screen name="camera" />
              <Stack.Screen name="rental-agreement" />
              <Stack.Screen name="request-details" />
              <Stack.Screen name="make-offer" />
              <Stack.Screen name="listing-detail" />
              <Stack.Screen name="renby/index" />
              <Stack.Screen name="renby/[id]" />
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
