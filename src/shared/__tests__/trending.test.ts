import { describe, it, expect, vi } from 'vitest';
import { LpuEventsClient } from '../client';

describe('LpuEventsClient.fetchTrendingEvents', () => {
  it('should fetch and map trending events ordered by sort_order', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
    const mockData = [
      {
        event_id: 'evt-1',
        sort_order: 1,
        events: {
          id: 'evt-1',
          name: 'Annual Hackathon 2026',
          status: 'PUBLISHED',
          end_at: futureDate,
          organizations: { name: 'Coding Club' },
          categories: { name: 'Technical', key: 'tech' },
        }
      },
      {
        event_id: 'evt-2',
        sort_order: 2,
        events: {
          id: 'evt-2',
          name: 'Campus Music Fest',
          status: 'PUBLISHED',
          end_at: futureDate,
          organizations: { name: 'Cultural Society' },
          categories: { name: 'Cultural', key: 'cultural' },
        }
      }
    ];

    const mockSelect = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockData, error: null })
    });

    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect
    });

    const client = new LpuEventsClient('http://localhost:54321', 'anon-key');
    client.supabase.from = mockFrom as any;

    const { data, error } = await client.fetchTrendingEvents();

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data?.[0].id).toBe('evt-1');
    expect(data?.[0].is_trending).toBe(true);
    expect(data?.[0].trending_sort_order).toBe(1);
    expect(data?.[1].id).toBe('evt-2');
    expect(data?.[1].is_trending).toBe(true);
    expect(data?.[1].trending_sort_order).toBe(2);
  });
});
