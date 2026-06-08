import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { CoordinationLiveBannerState } from '@/lib/rentalWizard/coordinationLiveBanner';
import { logCoordinationBanner } from '@/lib/rentalWizard/coordinationInstrumentation';

type CoordinationLiveBannerContextValue = {
  banner: CoordinationLiveBannerState | null;
  showBanner: (banner: CoordinationLiveBannerState) => void;
  dismissBanner: () => void;
};

const CoordinationLiveBannerContext = createContext<CoordinationLiveBannerContextValue | null>(null);

export function CoordinationLiveBannerProvider({ children }: { children: React.ReactNode }) {
  const [banner, setBanner] = useState<CoordinationLiveBannerState | null>(null);

  const showBanner = useCallback((next: CoordinationLiveBannerState) => {
    setBanner((prev) => {
      if (prev?.id === next.id) return prev;
      return next;
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setBanner((prev) => {
      if (prev) {
        logCoordinationBanner({
          event: 'dismissed',
          kind: prev.kind,
          lane: prev.lane,
          bannerShown: false,
        });
      }
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({ banner, showBanner, dismissBanner }),
    [banner, dismissBanner, showBanner]
  );

  return (
    <CoordinationLiveBannerContext.Provider value={value}>
      {children}
    </CoordinationLiveBannerContext.Provider>
  );
}

export function useCoordinationLiveBanner(): CoordinationLiveBannerContextValue | null {
  return useContext(CoordinationLiveBannerContext);
}
