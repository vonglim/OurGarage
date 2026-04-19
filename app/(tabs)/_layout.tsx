import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ui } from '@/constants/appUi';
import { pressedVisual } from '@/lib/pressFeedback';
import { useUnreadNotificationCount } from '../store/notificationsStore';

function TabBarButton(props: BottomTabBarButtonProps) {
  const { style: styleProp, ...rest } = props;
  return (
    <PlatformPressable
      {...rest}
      style={((state: { pressed: boolean }) => {
        const base =
          typeof styleProp === 'function'
            ? (styleProp as (s: { pressed: boolean }) => unknown)(state)
            : styleProp;
        return [
          base,
          {
            borderRadius: 14,
            paddingVertical: 6,
            paddingHorizontal: 8,
            overflow: 'hidden' as const,
          },
          pressedVisual(state.pressed),
        ];
      }) as unknown as BottomTabBarButtonProps['style']}
    />
  );
}

export default function TabLayout() {
  const unread = useUnreadNotificationCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: TabBarButton,
        tabBarActiveTintColor: ui.primary,
        tabBarInactiveTintColor: ui.textSecondary,
        tabBarActiveBackgroundColor: ui.surfaceTabActive,
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarStyle: {
          backgroundColor: ui.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: ui.border,
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
          title: 'My Activity',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'layers' : 'layers-outline'}
              size={size}
              color={color}
            />
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
          title: 'Notifications',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
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
