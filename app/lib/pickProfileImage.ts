import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/** Opens the library; returns asset URI or null if cancelled / denied. */
export async function pickProfileImageFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Photos access',
      'Allow photo library access in Settings to upload a profile picture.'
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}
