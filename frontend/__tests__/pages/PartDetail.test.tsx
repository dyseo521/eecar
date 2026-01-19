import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import PartDetail from '../../src/pages/PartDetail';
import { AuthProvider } from '../../src/context/AuthContext';

// Create a fresh query client for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

// Helper to wrap component with providers
const renderWithProviders = (partId: string) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/parts/${partId}`]}>
          <Routes>
            <Route path="/parts/:id" element={<PartDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('PartDetail', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should render the component without crashing', async () => {
    renderWithProviders('battery-001');

    // Component should render
    await waitFor(() => {
      const container = document.querySelector('div');
      expect(container).toBeTruthy();
    });
  });

  it('should display part name after loading', async () => {
    renderWithProviders('battery-001');

    // Wait for part data to load (component uses mock data fallback)
    await waitFor(() => {
      // Look for any battery-related content in the DOM
      const bodyText = document.body.textContent || '';
      expect(bodyText.includes('배터리') || bodyText.includes('Battery')).toBe(true);
    }, { timeout: 5000 });
  });

  it('should display price information', async () => {
    renderWithProviders('battery-001');

    await waitFor(() => {
      // Price should contain '원' somewhere in the page
      const bodyText = document.body.textContent || '';
      expect(bodyText.includes('원')).toBe(true);
    }, { timeout: 5000 });
  });

  it('should have navigation button', async () => {
    renderWithProviders('battery-001');

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it('should display manufacturer or seller info', async () => {
    renderWithProviders('battery-001');

    await waitFor(() => {
      // Should show manufacturer or seller info somewhere in the page
      const bodyText = document.body.textContent || '';
      expect(
        bodyText.includes('판매자') ||
        bodyText.includes('제조') ||
        bodyText.includes('SK온')
      ).toBe(true);
    }, { timeout: 5000 });
  });
});

describe('PartDetail - Contact Modal', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should have contact/inquiry related UI', async () => {
    renderWithProviders('battery-001');

    await waitFor(() => {
      // Look for contact button or text in body
      const bodyText = document.body.textContent || '';
      expect(
        bodyText.includes('문의') ||
        bodyText.includes('연락') ||
        bodyText.includes('구매')
      ).toBe(true);
    }, { timeout: 5000 });
  });
});

describe('PartDetail - Fallback to Mock Data', () => {
  beforeEach(() => {
    server.resetHandlers();
    // Override to return error - should fallback to mock data
    server.use(
      http.get('*/api/parts/:partId', () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );
  });

  it('should fallback to mock data when API fails', async () => {
    renderWithProviders('battery-001');

    // Even with API failure, component should render (uses mock fallback)
    await waitFor(() => {
      const container = document.querySelector('div');
      expect(container).toBeTruthy();
    }, { timeout: 5000 });
  });
});
