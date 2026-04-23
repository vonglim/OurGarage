import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';

import { nextLocalId } from '@/lib/idFactory';
import { touchLastActive } from './profileStore';

const STORAGE_KEY = '@ourgarage/user_reviews_v1';

export type UserReviewType = 'renter' | 'rentee';

export type UserReview = {
  id: string;
  rating: number;
  comment: string;
  type: UserReviewType;
  /** When review was submitted */
  timestamp: number;
  /** Request this review refers to (if any) */
  requestTimestamp: number | null;
  reviewerName: string;
};

let reviews: UserReview[] = [];
let version = 0;
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch {
    /* ignore */
  }
}

function normalizeLoaded(raw: unknown): UserReview[] {
  if (!Array.isArray(raw)) return [];
  const out: UserReview[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const rating = typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5 ? r.rating : 0;
    const comment = typeof r.comment === 'string' ? r.comment : '';
    const type = r.type === 'rentee' ? 'rentee' : 'renter';
    const timestamp = typeof r.timestamp === 'number' ? r.timestamp : 0;
    const requestTimestamp =
      typeof r.requestTimestamp === 'number' ? r.requestTimestamp : null;
    const reviewerName = typeof r.reviewerName === 'string' ? r.reviewerName : 'You';
    if (!id || !timestamp || rating < 1) continue;
    out.push({
      id,
      rating,
      comment,
      type,
      timestamp,
      requestTimestamp,
      reviewerName,
    });
  }
  return out;
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      reviews = normalizeLoaded(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  emit();
}

function ensureLoad() {
  if (!loadStarted) {
    loadStarted = true;
    void loadFromStorage();
  }
}

export function subscribeUserReviews(listener: () => void) {
  ensureLoad();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  ensureLoad();
  return version;
}

export function getUserReviews(): UserReview[] {
  ensureLoad();
  return [...reviews];
}

export function clearAllUserReviews(): void {
  ensureLoad();
  reviews = [];
  emit();
  void persist();
}

export function hasReviewForRequest(requestTimestamp: number): boolean {
  ensureLoad();
  return reviews.some((r) => r.requestTimestamp === requestTimestamp);
}

export async function addUserReview(entry: {
  rating: number;
  comment: string;
  type: UserReviewType;
  requestTimestamp: number | null;
  reviewerName: string;
}): Promise<void> {
  ensureLoad();
  const rating = Math.round(entry.rating);
  if (rating < 1 || rating > 5) return;
  const id = nextLocalId('review');
  reviews = [
    {
      id,
      rating,
      comment: entry.comment.trim(),
      type: entry.type === 'rentee' ? 'rentee' : 'renter',
      timestamp: Date.now(),
      requestTimestamp: entry.requestTimestamp,
      reviewerName: entry.reviewerName.trim() || 'You',
    },
    ...reviews,
  ];
  emit();
  await persist();
  touchLastActive();
}

export function useUserReviews(): UserReview[] {
  const v = useSyncExternalStore(subscribeUserReviews, getVersion, getVersion);
  return useMemo(() => {
    void v; // re-run when store version bumps
    return getUserReviews();
  }, [v]);
}
