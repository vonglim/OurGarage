import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { useActivityTabBadgeCount } from '@/hooks/useActivityTabBadgeCount';
import { useUnreadNotificationCount } from '@/store/notificationsStore';

function formatTabBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : String(count);
}

export default function TabLayout() {
  const unreadAlerts = useUnreadNotificationCount();
  const activityBadge = useActivityTabBadgeCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 20,
          left: 16,
          right: 16,
          paddingHorizontal: 20,
          backgroundColor: 'rgba(255,255,255,0.75)',
          borderRadius: 30,
          height: 60,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.4)',
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: '#0B1F3A',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
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
