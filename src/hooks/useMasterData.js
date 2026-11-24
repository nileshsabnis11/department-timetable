import { useCallback, useEffect, useState } from 'react';
import { createEmptyMasterData } from '../data/defaultConfig.js';
import { createSampleMasterData } from '../data/sampleData.js';
import {
  loadMasterDataWithNotice,
  restorePreservedMasterData,
  saveMasterData,
} from '../lib/storage.js';

/**
 * Master data store: loads from localStorage and writes back on every change.
 *
 * `notice` explains a repaired/migrated/newer saved payload so the UI can warn
 * instead of silently starting from an empty dataset.
 */
export function useMasterData() {
  const [initial] = useState(loadMasterDataWithNotice);
  const [data, setData] = useState(initial.data);
  const [notice, setNotice] = useState(initial.notice);

  useEffect(() => {
    if (saveMasterData(data)) return;
    // Never let an edit disappear silently; App renders this notice.
    setNotice((previous) =>
      previous?.type === 'storage'
        ? previous
        : {
            type: 'storage',
            preserved: false,
            message:
              'Your latest Master Data changes could not be saved — this browser’s storage is full or blocked. Export a JSON backup now, then archive or delete an old semester.',
          },
    );
  }, [data]);

  const updateSection = useCallback((section, updater) => {
    setData((previous) => ({
      ...previous,
      [section]:
        typeof updater === 'function' ? updater(previous[section]) : updater,
    }));
  }, []);

  const loadSample = useCallback(() => setData(createSampleMasterData()), []);
  const resetAll = useCallback(() => setData(createEmptyMasterData()), []);

  const restorePreserved = useCallback(() => {
    const restored = restorePreservedMasterData();
    if (!restored) return false;
    setData(restored);
    setNotice(null);
    return true;
  }, []);

  return {
    data,
    notice,
    dismissNotice: () => setNotice(null),
    restorePreserved,
    updateSection,
    loadSample,
    resetAll,
  };
}
