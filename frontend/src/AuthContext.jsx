import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { login as loginRequest, setAuthToken, clearAuthToken, setUnauthorizedHandler } from './api';

const TOKEN_STORAGE_KEY = 'dailyledger_token';

function isTokenValid(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function readStoredToken() {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && isTokenValid(stored)) {
      return stored;
    }
    if (stored) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode, disabled storage, etc.)
  }
  return null;
}

function usernameFromToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).username || '';
  } catch {
    return '';
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const stored = readStoredToken();
    if (stored) setAuthToken(stored);
    return stored;
  });

  const logout = useCallback(() => {
    clearAuthToken();
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    setToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const data = await loginRequest(username, password);
    setAuthToken(data.token);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    } catch {
      // ignore
    }
    setToken(data.token);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(token),
      username: token ? usernameFromToken(token) : '',
      login,
      logout,
    }),
    [token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
