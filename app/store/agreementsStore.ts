import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_TERMS_KEY = '@ourgarage/onboarding_terms_accepted_v1';

export async function getOnboardingTermsAccepted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_TERMS_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingTermsAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_TERMS_KEY, '1');
  } catch {
    /* ignore */
  }
}
