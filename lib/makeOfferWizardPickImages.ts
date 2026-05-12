import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { pickPhotoFromLibrary, takePhotoFromCamera } from '@/lib/pickProfileImage';

export { pickPhotoFromLibrary, takePhotoFromCamera };

/** Camera vs library — web uses library only (no native camera sheet). */
export async function offerWizardPickPhotoSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return 'library';
  return new Promise((resolve) => {
    Alert.alert(
      'Add photo',
      'Choose a source',
      [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Photo Library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

/** Multi-select from library (same quality as `pickPhotoFromLibrary`). */
export async function pickMultipleOfferPhotos(maxCount: number): Promise<string[]> {
  if (maxCount <= 0) return [];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photos access', 'Allow photo library access in Settings to attach photos.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    allowsMultipleSelection: true,
    selectionLimit: maxCount,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a) => a.uri).filter(Boolean);
}
