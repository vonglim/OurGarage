import { useEffect, useRef } from 'react';

import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { useDevToolsStore } from '@/store/devToolsStore';

/**
 * Registers a screen-local autofill runner for the dev FAB ("Autofill current page").
 * Does not run automatically — only when the QA menu invokes it.
 */
export function useDevPageAutofill(run: () => void, options?: { screenLabel?: string | null }): void {
  const runRef = useRef(run);
  runRef.current = run;
  const setPageAutofill = useDevToolsStore((s) => s.setPageAutofill);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return;
    setPageAutofill(() => runRef.current(), options?.screenLabel ?? null);
    return () => setPageAutofill(null, null);
  }, [setPageAutofill, options?.screenLabel]);
}
