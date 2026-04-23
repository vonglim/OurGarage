import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { USER_AVATAR_PRESETS, type UserAvatarPreset } from '@/lib/userAvatarPresets';

const PRESET_CELL = 72;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectPreset: (presetId: string) => void;
};

export function PresetAvatarModal({ visible, onClose, onSelectPreset }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose an avatar</Text>
          <View style={styles.presetGrid}>
            {USER_AVATAR_PRESETS.map((preset: UserAvatarPreset) => (
              <Pressable
                key={preset.id}
                style={({ pressed }) => [
                  styles.presetCell,
                  pressed && styles.presetCellPressed,
                ]}
                onPress={() => {
                  onSelectPreset(preset.id);
                  onClose();
                }}
              >
                <View
                  style={[
                    styles.presetCircle,
                    { backgroundColor: preset.color },
                  ]}
                >
                  <Ionicons
                    name={
                      preset.icon as React.ComponentProps<
                        typeof Ionicons
                      >['name']
                    }
                    size={28}
                    color={ui.primaryOn}
                  />
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.modalClose,
              pressed && styles.modalClosePressed,
            ]}
            onPress={onClose}
          >
            <Text style={styles.modalCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: ui.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 8,
  },
  presetCell: {
    borderRadius: PRESET_CELL / 2,
  },
  presetCellPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  presetCircle: {
    width: PRESET_CELL,
    height: PRESET_CELL,
    borderRadius: PRESET_CELL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalClosePressed: {
    opacity: 0.7,
  },
  modalCloseText: {
    fontSize: 17,
    color: ui.primary,
    fontWeight: '500',
  },
});
