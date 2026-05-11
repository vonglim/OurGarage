import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { outlinePrimaryPressed, primarySolidPressed, ui } from '@/constants/appUi';

export type PosterOfferCardNegotiationProps = {
  counterpartyFirstName: string;
  busy: boolean;
  showIncoming: boolean;
  showOutgoing: boolean;
  posterCanConfirmRental: boolean;
  showCounterButton: boolean;
  onDecline: () => void;
  onAcceptOffer: () => void;
  onCounter: () => void;
  onConfirmRental: () => void;
};

export function PosterOfferCardNegotiation({
  counterpartyFirstName,
  busy,
  showIncoming,
  showOutgoing,
  posterCanConfirmRental,
  showCounterButton,
  onDecline,
  onAcceptOffer,
  onCounter,
  onConfirmRental,
}: PosterOfferCardNegotiationProps) {
  if (posterCanConfirmRental) {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.destructive,
              pressed && styles.destructivePressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.destructiveText}>Decline</Text>
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={busy}
            onPress={onConfirmRental}
            style={({ pressed }) => [
              styles.primaryWide,
              pressed && styles.primaryPressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>Confirm Rental</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (showIncoming) {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.destructive,
              pressed && styles.destructivePressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.destructiveText}>Decline</Text>
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={busy}
            onPress={onAcceptOffer}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.primaryPressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>Accept Offer</Text>
          </Pressable>
          {showCounterButton ? (
            <Pressable
              pressOpacityFeedback={false}
              disabled={busy}
              onPress={onCounter}
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.secondaryPressed,
                busy && styles.disabled,
              ]}
            >
              <View style={styles.counterInner}>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={ui.primary} />
                <Text style={styles.secondaryText}>Counter</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (showOutgoing) {
    return (
      <View style={styles.wrap}>
        <View style={styles.waitingBlock}>
          <Text style={styles.waitingTitle}>Counter sent</Text>
          <Text style={styles.waitingText}>Waiting for response from {counterpartyFirstName}</Text>
        </View>
        <View style={styles.row}>
          {showCounterButton ? (
            <Pressable
              pressOpacityFeedback={false}
              disabled={busy}
              onPress={onCounter}
              style={({ pressed }) => [
                styles.secondary,
                styles.secondaryGrow,
                pressed && styles.secondaryPressed,
                busy && styles.disabled,
              ]}
            >
              <View style={styles.counterInner}>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={ui.primary} />
                <Text style={styles.secondaryText}>Modify Counter</Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.destructive,
              pressed && styles.destructivePressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.destructiveText}>Withdraw</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 10,
    width: '100%',
  },
  waitingBlock: {
    width: '100%',
    marginBottom: 10,
  },
  waitingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  waitingText: {
    fontSize: 12,
    color: ui.textSecondary,
    marginTop: 2,
  },
  primary: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  primaryWide: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryPressed: {
    ...primarySolidPressed,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primaryOn,
    textAlign: 'center',
  },
  secondary: {
    minWidth: 100,
    maxWidth: 140,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  secondaryGrow: {
    flex: 1,
    minWidth: 0,
  },
  secondaryPressed: {
    ...outlinePrimaryPressed,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.primary,
  },
  counterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destructive: {
    minWidth: 88,
    maxWidth: 112,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: ui.danger,
    backgroundColor: ui.background,
  },
  destructivePressed: {
    backgroundColor: '#FFEBEE',
  },
  destructiveText: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.danger,
  },
  disabled: {
    opacity: 0.48,
  },
});
