import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useSearchExplanations } from '../../src/hooks/useSearchExplanations';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useSearchExplanations', () => {
  it('loads explanations for the given parts', async () => {
    const { result } = renderHook(() => useSearchExplanations('ESS 배터리', ['a', 'b']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ a: 'ESS 배터리: a 설명', b: 'ESS 배터리: b 설명' });
  });

  it('does not request when there is nothing to explain', () => {
    const { result } = renderHook(() => useSearchExplanations('ESS 배터리', []), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    const { result: noQuery } = renderHook(() => useSearchExplanations(undefined, ['a']), { wrapper });
    expect(noQuery.current.fetchStatus).toBe('idle');
  });

  it('reports an error without throwing when the API fails', async () => {
    server.use(http.post('*/api/search/explain', () => new HttpResponse(null, { status: 500 })));
    const { result } = renderHook(() => useSearchExplanations('배터리', ['a']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
