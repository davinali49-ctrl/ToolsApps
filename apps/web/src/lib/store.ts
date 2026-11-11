import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchHealth } from '../lib/api';
import type { Health } from '../core/types';
import { normalizeServerUrl } from './utils';

export const DEFAULT_SERVER_URL = 'http://localhost:8787';

interface AppState {
  serverUrl: string;
  serverStatus: 'unknown' | 'checking' | 'online' | 'offline';
  health: Health | null;
  serverError: string | null;
  setServerUrl: (url: string) => void;
  checkServer: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: DEFAULT_SERVER_URL,
      serverStatus: 'unknown',
      health: null,
      serverError: null,

      setServerUrl: (url) => {
        set({
          serverUrl: normalizeServerUrl(url, DEFAULT_SERVER_URL),
          serverStatus: 'unknown',
          health: null,
          serverError: null
        });
      },

      checkServer: async () => {
        const { serverUrl } = get();
        set({ serverStatus: 'checking', serverError: null });
        try {
          const health = await fetchHealth(serverUrl);
          set({ health, serverStatus: 'online' });
        } catch (error) {
          set({
            serverStatus: 'offline',
            health: null,
            serverError: error instanceof Error ? error.message : 'Server tidak tersedia.'
          });
        }
      }
    }),
    {
      name: 'toolsapps.settings',
      partialize: (state) => ({ serverUrl: state.serverUrl })
    }
  )
);
