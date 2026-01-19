import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { getApiUrl } from '../config';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'buyer' | 'seller';
  companyName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role: 'buyer' | 'seller', companyName?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('eecar_token');
    const storedUser = localStorage.getItem('eecar_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('eecar_token');
        localStorage.removeItem('eecar_user');
      }
    }

    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(getApiUrl('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '로그인에 실패했습니다');
    }

    const data = await response.json();

    setToken(data.token);
    setUser(data.user);

    localStorage.setItem('eecar_token', data.token);
    localStorage.setItem('eecar_user', JSON.stringify(data.user));
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    name: string,
    role: 'buyer' | 'seller',
    companyName?: string
  ) => {
    const response = await fetch(getApiUrl('auth/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role, companyName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '회원가입에 실패했습니다');
    }

    const data = await response.json();

    setToken(data.token);
    setUser(data.user);

    localStorage.setItem('eecar_token', data.token);
    localStorage.setItem('eecar_user', JSON.stringify(data.user));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('eecar_token');
    localStorage.removeItem('eecar_user');
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    user,
    token,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    isLoading,
  }), [user, token, login, signup, logout, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
