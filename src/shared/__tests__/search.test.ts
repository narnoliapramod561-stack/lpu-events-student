import { describe, it, expect, vi } from 'vitest';
import { LpuEventsClient } from '../client';

describe('LpuEventsClient.searchEvents', () => {
  it('should call supabase rpc with polymorphic limit and default parameters (p_event_name_only = false)', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = new LpuEventsClient('http://localhost:54321', 'anon-key');
    client.supabase.rpc = mockRpc;

    await client.searchEvents('hackathon', 15, 5);

    expect(mockRpc).toHaveBeenCalledWith('search_events', {
      query_text: 'hackathon',
      limit_count: 15,
      offset_count: 5,
      p_category_id: null,
      p_subcategory_id: null,
      p_pricing_type: null,
      p_timeline: null,
      p_target_date: null,
      p_show_past: false,
      p_event_name_only: false,
    });
  });

  it('should call supabase rpc with structured filter options and event_name_only = true', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = new LpuEventsClient('http://localhost:54321', 'anon-key');
    client.supabase.rpc = mockRpc;

    await client.searchEvents('workshop', {
      limit: 10,
      offset: 0,
      category_id: 'cat-123',
      subcategory_id: 'sub-456',
      pricing_type: 'FREE',
      timeline: 'this_week',
      target_date: '2026-08-20',
      show_past: true,
      event_name_only: true,
    });

    expect(mockRpc).toHaveBeenCalledWith('search_events', {
      query_text: 'workshop',
      limit_count: 10,
      offset_count: 0,
      p_category_id: 'cat-123',
      p_subcategory_id: 'sub-456',
      p_pricing_type: 'FREE',
      p_timeline: 'this_week',
      p_target_date: '2026-08-20',
      p_show_past: true,
      p_event_name_only: true,
    });
  });

  it('should correctly handle default values when options object is empty', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = new LpuEventsClient('http://localhost:54321', 'anon-key');
    client.supabase.rpc = mockRpc;

    await client.searchEvents('csi', {});

    expect(mockRpc).toHaveBeenCalledWith('search_events', {
      query_text: 'csi',
      limit_count: 20,
      offset_count: 0,
      p_category_id: null,
      p_subcategory_id: null,
      p_pricing_type: null,
      p_timeline: null,
      p_target_date: null,
      p_show_past: false,
      p_event_name_only: false,
    });
  });
});
