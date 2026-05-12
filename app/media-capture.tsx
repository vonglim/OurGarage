import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';

import { CameraCaptureScreen } from '@/components/media/CameraCaptureScreen';
import { MAX_LISTING_TOTAL_PHOTOS } from '@/components/listingFlow/listingConstants';
import { useMediaCaptureSessionStore } from '@/store/mediaCaptureSessionStore';

/**
 * Fullscreen media capture route — used by Listing Wizard today; later by offers/requests/profile.
 */
export default function MediaCaptureScreen() {
  const router = useRouter();
  const [bootstrap] = useState(() => useMediaCaptureSessionStore.getState().takeListingBootstrap());

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <CameraCaptureScreen
        maxPhotos={MAX_LISTING_TOTAL_PHOTOS}
        initialItems={bootstrap?.items}
        initialCoverId={bootstrap?.coverId}
        flowContextTitle="Listing photos"
        flowContextSubtitle="Tap Done to add these shots to your listing."
        onClose={() => router.back()}
        onDone={(result) => {
          useMediaCaptureSessionStore.getState().setListingPendingCommit(result);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
