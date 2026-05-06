import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { getSupabase } from '../lib/supabase';

export default function ResetPassword() {
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    const handleSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (data?.session) {
        console.log('User authenticated via email link');
        router.replace('/'); // go to home or wherever
      } else {
        console.log('No session yet');
      }
    };

    handleSession();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Completing login...</Text>
    </View>
  );
}