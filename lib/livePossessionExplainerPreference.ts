import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'og.ownerLivePossessionExplainer.skip';

export async function readLivePossessionExplainerSkipped(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLivePossessionExplainerSkipped(skip: boolean): Promise<void> {
  try {
    if (skip) {
      await AsyncStorage.setItem(STORAGE_KEY, '1');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* non-fatal */
  }
}
