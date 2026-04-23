import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useActivityTabBadgeCount } from '@/hooks/useActivityTabBadgeCount';
import { ui } from '@/constants/appUi';
import { pressedVisual } from '@/lib/pressFeedback';
import { useUnreadNotificationCount } from '@/store/notificationsStore';

function formatTabBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : String(count);
}

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
            paddingVertical: 4,
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
  const unreadAlerts = useUnreadNotificationCount();
  const activityBadge = useActivityTabBadgeCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: TabBarButton,
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
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
        tabBarLabelStyle: {
          fontSize: 11,
          marginTop: 0,
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarActiveTintColor: ui.primary,
        tabBarInactiveTintColor: ui.textSecondary,
        tabBarActiveBackgroundColor: ui.surfaceTabActive,
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarStyle: {
          backgroundColor: ui.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: ui.border,
          height: 74,
          paddingBottom: 5,
          paddingTop: 5,
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
                  { translateX: 5 },
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
