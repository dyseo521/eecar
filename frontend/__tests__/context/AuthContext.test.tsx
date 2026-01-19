import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { server } from '../mocks/server';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';

// Test component to access auth context
function TestComponent() {
  const { user, isAuthenticated, login, logout, signup, isLoading } = useAuth();

  const handleLogin = async () => {
    try {
      await login('test@test.com', 'password123');
    } catch (error) {
      // Error is expected in some tests
    }
  };

  const handleSignup = async () => {
    try {
      await signup('new@test.com', 'password', 'New User', 'buyer');
    } catch (error) {
      // Error is expected in some tests
    }
  };

  return (
    <div>
      <span data-testid="auth-status">
        {isAuthenticated ? 'authenticated' : 'not-authenticated'}
      </span>
      <span data-testid="loading-status">
        {isLoading ? 'loading' : 'ready'}
      </span>
      {user && <span data-testid="user-email">{user.email}</span>}
      {user && <span data-testid="user-role">{user.role}</span>}
      <button onClick={handleLogin} data-testid="login-btn">
        Login
      </button>
      <button onClick={() => logout()} data-testid="logout-btn">
        Logout
      </button>
      <button onClick={handleSignup} data-testid="signup-btn">
        Signup
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    server.resetHandlers();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should provide default unauthenticated state', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    expect(screen.queryByTestId('user-email')).toBeNull();
  });

  it('should login successfully with valid credentials', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    // Click login button
    await user.click(screen.getByTestId('login-btn'));

    // Wait for authentication to complete
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    // User info should be displayed
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
    expect(screen.getByTestId('user-role')).toHaveTextContent('buyer');
  });

  it('should logout successfully', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    // Login first
    await user.click(screen.getByTestId('login-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    // Then logout
    await user.click(screen.getByTestId('logout-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });
  });

  it('should signup successfully', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    // Click signup button
    await user.click(screen.getByTestId('signup-btn'));

    // Wait for authentication to complete
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });
  });

  it('should persist authentication state in localStorage', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    // Login
    await user.click(screen.getByTestId('login-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    // Check localStorage (uses 'eecar_token' key)
    expect(localStorage.getItem('eecar_token')).toBeTruthy();
    expect(localStorage.getItem('eecar_user')).toBeTruthy();
  });

  it('should clear token on logout', async () => {
    const user = userEvent.setup();

    // Pre-set token with correct keys
    localStorage.setItem('eecar_token', 'existing-token');
    localStorage.setItem('eecar_user', JSON.stringify({
      id: '1',
      email: 'test@test.com',
      name: 'Test',
      role: 'buyer'
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load - should be authenticated from localStorage
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    // Logout
    await user.click(screen.getByTestId('logout-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });

    // Token should be cleared
    expect(localStorage.getItem('eecar_token')).toBeNull();
    expect(localStorage.getItem('eecar_user')).toBeNull();
  });

  it('should load user from localStorage on mount', async () => {
    // Pre-set valid user data
    localStorage.setItem('eecar_token', 'valid-token');
    localStorage.setItem('eecar_user', JSON.stringify({
      id: 'user-1',
      email: 'stored@test.com',
      name: 'Stored User',
      role: 'seller',
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('ready');
    });

    // Should be authenticated from localStorage
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('stored@test.com');
    expect(screen.getByTestId('user-role')).toHaveTextContent('seller');
  });
});

describe('AuthContext - useAuth Hook', () => {
  it('should throw error when used outside AuthProvider', () => {
    // Component that uses useAuth without provider
    function InvalidComponent() {
      try {
        useAuth();
        return <div>Should not render</div>;
      } catch (e) {
        return <div data-testid="error">Error caught</div>;
      }
    }

    render(<InvalidComponent />);
    expect(screen.getByTestId('error')).toHaveTextContent('Error caught');
  });
});
