import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refreshAuth() {
    const data = await api('/auth/check');
    setUser(data.loggedIn ? data.user : null);
    setCartCount(data.cartCount || 0);
    setLoading(false);
    return data;
  }

  useEffect(() => {
    refreshAuth();
  }, []);

  const value = useMemo(
    () => ({
      user,
      cartCount,
      loading,
      isAdmin: user?.role === 'admin',
      refreshAuth,
      setCartCount,
      async login(username, password) {
        const data = await api('/login', {
          method: 'POST',
          body: JSON.stringify({ identifier: username, username, password })
        });
        if (data.success) await refreshAuth();
        return data;
      },
      async logout() {
        await api('/logout', { method: 'POST' });
        setUser(null);
        setCartCount(0);
      }
    }),
    [user, cartCount, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
