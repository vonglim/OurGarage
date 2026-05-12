import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, View } from 'react-native';
import { KeyboardToolbar } from 'react-native-keyboard-controller';

type CtxValue = {
  /** Call when a number-pad / decimal-pad field receives focus. */
  scheduleShow: () => void;
  /** Call when that field loses focus (debounced so switching between numeric fields does not flicker). */
  scheduleHide: () => void;
};

const RequestNumericKeyboardToolbarContext = createContext<CtxValue | null>(null);

/**
 * Android: shows `KeyboardToolbar` only while a wired numeric field is focused.
 * iOS: omits the toolbar (numeric fields use global `NumberPadKeyboardAccessory` + native return on text fields).
 */
export function RequestNumericKeyboardToolbarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleShow = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (Platform.OS === 'android') {
      setVisible(true);
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      hideTimer.current = null;
    }, 220);
  }, []);

  const value = useMemo(() => ({ scheduleShow, scheduleHide }), [scheduleShow, scheduleHide]);

  return (
    <RequestNumericKeyboardToolbarContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {Platform.OS === 'android' && visible ? <KeyboardToolbar showArrows={false} /> : null}
      </View>
    </RequestNumericKeyboardToolbarContext.Provider>
  );
}

export function useRequestNumericKeyboardToolbarSync(): {
  onNumericFocus: () => void;
  onNumericBlur: () => void;
} {
  const ctx = useContext(RequestNumericKeyboardToolbarContext);
  const noop = useCallback(() => {}, []);
  if (!ctx) {
    return { onNumericFocus: noop, onNumericBlur: noop };
  }
  return { onNumericFocus: ctx.scheduleShow, onNumericBlur: ctx.scheduleHide };
}
