/**
 * SmartFlow Auth Store (Zustand)
 * Manages authentication state with localStorage persistence.
 * Never exposes refresh tokens to the server.
 */
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type User } from '@/lib/api/client';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; password: string; full_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (identifier: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login({ email: identifier, password });
          const { access_token, refresh_token, user } = response.data as { access_token: string; refresh_token: string; user: User };
          
          // Store token in localStorage for API client
          localStorage.setItem('access_token', access_token);
          
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          await authApi.register(data);
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          await authApi.logout(refreshToken || undefined);
        } catch {
          // Clear state even if logout request fails
        }
        localStorage.removeItem('access_token');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const response = await authApi.refresh(refreshToken);
          const { access_token } = response.data as { access_token: string };
          localStorage.setItem('access_token', access_token);
          set({ accessToken: access_token });
        } catch {
          // Refresh failed — clear auth
          get().clearAuth();
        }
      },

      setUser: (user: User) => set({ user }),

      clearAuth: () => {
        localStorage.removeItem('access_token');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'smartflow-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync access_token to localStorage for API client on rehydration
        if (state?.accessToken) {
          localStorage.setItem('access_token', state.accessToken);
        }
      },
    }
  )
);
