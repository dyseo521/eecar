import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
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
    } catch (error) {
      throw error;
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    role: 'buyer' | 'seller',
    companyName?: string
  ) => {
    try {
      const response = await fetch('/api/auth/signup', {
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
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('eecar_token');
    localStorage.removeItem('eecar_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
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
