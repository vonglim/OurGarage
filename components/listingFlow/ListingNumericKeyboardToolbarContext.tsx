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
  scheduleShow: () => void;
  scheduleHide: () => void;
};

const ListingNumericKeyboardToolbarContext = createContext<CtxValue | null>(null);

/** Android-only numeric keyboard Done bar (same policy as Request wizard). */
export function ListingNumericKeyboardToolbarProvider({ children }: { children: React.ReactNode }) {
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
    <ListingNumericKeyboardToolbarContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {Platform.OS === 'android' && visible ? <KeyboardToolbar showArrows={false} /> : null}
      </View>
    </ListingNumericKeyboardToolbarContext.Provider>
  );
}

export function useListingNumericKeyboardToolbarSync(): {
  onNumericFocus: () => void;
  onNumericBlur: () => void;
} {
  const ctx = useContext(ListingNumericKeyboardToolbarContext);
  const noop = useCallback(() => {}, []);
  if (!ctx) {
    return { onNumericFocus: noop, onNumericBlur: noop };
  }
  return { onNumericFocus: ctx.scheduleShow, onNumericBlur: ctx.scheduleHide };
}
