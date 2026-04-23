import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { FlatList, type ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { EquipmentListingCard } from '@/components/renby/EquipmentListingCard';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ui } from '@/constants/appUi';
import { RENBY_LISTINGS, type RenbyEquipmentListing } from '@/lib/renbyListings';

export default function RenbyMarketplaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const renderItem = useCallback<ListRenderItem<RenbyEquipmentListing>>(
    ({ item }) => (
      <EquipmentListingCard listing={item} onPress={() => router.push(`/renby/${item.id}`)} />
    ),
    [router]
  );

  return (
    <KeyboardDismissScreen style={styles.root}>
      <ScreenEntrance style={styles.flex}>
        <FlatList
          data={RENBY_LISTINGS}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>No listings yet. Check back soon.</Text>
          }
          ListHeaderComponent={
            <View style={[styles.headerBlock, { paddingTop: insets.top + ui.spaceMd }]}>
              <Text style={styles.brand}>Renby</Text>
              <Text style={styles.tagline}>Equipment rentals near you</Text>
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 28 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        />
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  flex: {
    flex: 1,
  },
  headerBlock: {
    paddingHorizontal: ui.padScreenH,
    marginBottom: ui.spaceMd,
  },
  brand: {
    fontSize: 34,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 4,
    fontSize: ui.fontSecondary,
    color: ui.textSecondary,
  },
  listContent: {
    paddingHorizontal: ui.padScreenH,
    paddingTop: 0,
    flexGrow: 1,
  },
  empty: {
    paddingVertical: 32,
    fontSize: ui.fontSecondary,
    color: ui.textSecondary,
    textAlign: 'center',
  },
});
