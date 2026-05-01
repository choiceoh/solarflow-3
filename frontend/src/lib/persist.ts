import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

const CACHE_BUSTER = 'solarflow-cache-v1';

export const idbPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: async (key, value) => {
      await set(key, value);
    },
    removeItem: async (key) => {
      await del(key);
    },
  },
  key: 'solarflow-rq-cache',
  throttleTime: 1_000,
});

export const persistOptions = {
  persister: idbPersister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: CACHE_BUSTER,
};
