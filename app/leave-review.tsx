import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProfile } from './store/profileStore';
import { addUserReview, type UserReviewType } from './store/userReviewsStore';

import { ui } from '@/constants/appUi';

export default function LeaveReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    requestTimestamp?: string;
    type?: string;
  }>();

  const requestTs =
    params.requestTimestamp != null && params.requestTimestamp !== ''
      ? Number(params.requestTimestamp)
      : NaN;
  const requestTimestamp = Number.isFinite(requestTs) ? requestTs : null;

  const reviewType: UserReviewType =
    params.type === 'rentee' ? 'rentee' : 'renter';

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = async () => {
    if (rating < 1) {
      Alert.alert('Rating required', 'Please select 1–5 stars before submitting.');
      return;
    }
    const profile = getProfile();
    await addUserReview({
      rating,
      comment,
      type: reviewType,
      requestTimestamp,
      reviewerName: profile.name.trim() || 'You',
    });
    Alert.alert('Thank you', 'Your review was saved.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Leave a review</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Rating</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setRating(n)}
              style={({ pressed }) => [
                styles.starHit,
                pressed && styles.starHitPressed,
              ]}
              accessibilityLabel={`${n} stars`}
            >
              <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.ratingHint}>
          {rating > 0 ? `${rating} of 5` : 'Tap a star to rate'}
        </Text>

        <Text style={[styles.label, styles.labelSpaced]}>Comment (optional)</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Share details about your experience"
          placeholderTextColor="#8E8E93"
          style={styles.input}
          multiline
          textAlignVertical="top"
          maxLength={800}
        />

        <Pressable
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.submit,
            pressed && styles.submitPressed,
          ]}
        >
          <Text style={styles.submitText}>Submit</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 10,
  },
  labelSpaced: {
    marginTop: 22,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  starHit: {
    padding: 6,
  },
  starHitPressed: {
    opacity: 0.75,
  },
  star: {
    fontSize: 36,
    color: '#D1D1D6',
  },
  starFilled: {
    color: '#F9A825',
  },
  ratingHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#6D6D72',
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#FFFFFF',
  },
  submit: {
    marginTop: 24,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
  },
  submitPressed: {
    opacity: ui.pressOpacity,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
