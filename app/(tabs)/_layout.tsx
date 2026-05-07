import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ui } from '@/constants/appUi';
import { useActivityTabBadgeCount } from '@/hooks/useActivityTabBadgeCount';
import { useUnreadNotificationCount } from '@/store/notificationsStore';

function formatTabBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : String(count);
}

export default function TabLayout() {
  const unreadAlerts = useUnreadNotificationCount();
  const activityBadge = useActivityTabBadgeCount();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: bottomGap,
          left: 0,
          right: 0,
          marginHorizontal: 14,
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 6,
          backgroundColor: ui.primary,
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
          borderRadius: 34,
          height: 70,
          borderTopWidth: 0,
          borderWidth: 0,
          elevation: 16,
          shadowColor: '#000000',
          shadowOpacity: 0.2,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          zIndex: 5,
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(226,232,240,0.75)',
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 0,
          lineHeight: 14,
          fontWeight: '600',
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarBadgeStyle: {
          backgroundColor: '#FF3B30',
          color: '#FFFFFF',
          fontSize: 10,
          fontWeight: '700',
          minWidth: 18,
          height: 18,
          lineHeight: 16,
          borderRadius: 9,
          paddingHorizontal: 4,
          overflow: 'hidden',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'search' : 'search-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarBadge: formatTabBadge(activityBadge),
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                transform: [
                  { translateY: -2 },
                  { translateX: 0 },
                ],
              }}
            >
              <Ionicons
                name={focused ? 'layers' : 'layers-outline'}
                size={size}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Messages',
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarBadge: formatTabBadge(unreadAlerts),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'notifications' : 'notifications-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: 'Reviews',
          href: null,
        }}
      />
    </Tabs>
  );
}
