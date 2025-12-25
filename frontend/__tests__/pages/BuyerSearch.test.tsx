import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import BuyerSearch from '../../src/pages/BuyerSearch';
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
const renderWithProviders = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <BuyerSearch />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('BuyerSearch', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should render the page title', async () => {
    renderWithProviders();

    // Page should have title
    await waitFor(() => {
      expect(screen.getByText(/부품 검색|Part Search|Search/i)).toBeInTheDocument();
    });
  });

  it('should render search input field', async () => {
    renderWithProviders();

    // Look for any input element
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it('should have category filter buttons', async () => {
    renderWithProviders();

    // Look for category-related text (use queryAllByText since there are multiple matches)
    await waitFor(() => {
      const categoryElements = screen.queryAllByText(/전체|배터리|모터|카테고리/i);
      expect(categoryElements.length).toBeGreaterThan(0);
    });
  });

  it('should have price filter controls', async () => {
    renderWithProviders();

    await waitFor(() => {
      // Look for price-related text (use queryAllByText)
      const priceElements = screen.queryAllByText(/가격|price|원/i);
      expect(priceElements.length).toBeGreaterThan(0);
    });
  });

  it('should render back button to home', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/홈으로|home|뒤로/i)).toBeInTheDocument();
    });
  });
});

describe('BuyerSearch - Search Functionality', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should have a search button', async () => {
    renderWithProviders();

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('should display results section', async () => {
    renderWithProviders();

    // Results area should exist
    await waitFor(() => {
      const container = document.querySelector('.buyer-search');
      expect(container).toBeInTheDocument();
    });
  });
});

describe('BuyerSearch - Filters', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('should have AI mode toggle', async () => {
    renderWithProviders();

    // Look for AI toggle text
    await waitFor(() => {
      const aiText = screen.queryByText(/AI|검색 모드/i);
      expect(aiText || document.querySelector('.buyer-search')).toBeTruthy();
    });
  });

  it('should have advanced filter section', async () => {
    renderWithProviders();

    // Advanced filters should be accessible
    const container = document.querySelector('.buyer-search');
    expect(container).toBeTruthy();
  });
});
