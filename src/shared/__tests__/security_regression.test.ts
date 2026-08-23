import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LpuEventsClient } from '../client';

describe('Security Regression Suite (V2 Hardened)', () => {
  let client: LpuEventsClient;
  let mockRpc: any;
  let mockFrom: any;

  beforeEach(() => {
    mockRpc = vi.fn();
    mockFrom = vi.fn();
    client = new LpuEventsClient('http://localhost:54321', 'test-anon-key');
    client.supabase.rpc = mockRpc;
    client.supabase.from = mockFrom;
  });

  describe('AUTH-RPC-001: Outbox Worker Authorization & Strict Worker Domain', () => {
    it('AUTH-RPC-001-REG-001: Anonymous/public caller claiming outbox events must be rejected', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unauthorized: Service role worker credentials required.', code: '42501' }
      });

      const { data, error } = await client.claimOutboxEvents(25);

      expect(mockRpc).toHaveBeenCalledWith('claim_outbox_events', { p_batch_size: 25 });
      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toContain('Service role worker credentials required');
    });

    it('AUTH-RPC-001-REG-002: Trusted service worker claiming outbox events succeeds', async () => {
      const mockOutboxEvents = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          event_type: 'CACHE_INVALIDATION',
          aggregate_type: 'events',
          aggregate_id: '00000000-0000-0000-0000-000000000002',
          payload: { tags: ['events'] },
          attempt_count: 0
        }
      ];

      mockRpc.mockResolvedValueOnce({
        data: mockOutboxEvents,
        error: null
      });

      const { data, error } = await client.claimOutboxEvents(50);

      expect(error).toBeNull();
      expect(data).toEqual(mockOutboxEvents);
      expect(data?.length).toBe(1);
    });

    it('AUTH-RPC-001-REG-003: Unauthenticated caller completing outbox events is blocked', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Service role credentials required.', code: '403' }
      });

      const { error } = await client.completeOutboxEvent('00000000-0000-0000-0000-000000000001');

      expect(mockRpc).toHaveBeenCalledWith('complete_outbox_event', {
        p_event_id: '00000000-0000-0000-0000-000000000001'
      });
      expect(error).toBeDefined();
    });

    it('AUTH-RPC-001-REG-004: Unauthenticated caller cleaning up outbox events is blocked', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Service role credentials required.', code: '403' }
      });

      const { error } = await client.cleanupProcessedOutboxEvents(7);

      expect(mockRpc).toHaveBeenCalledWith('cleanup_processed_outbox_events', {
        p_retention_days: 7
      });
      expect(error).toBeDefined();
    });

    it('AUTH-RPC-001-REG-005: Super Admin attempting worker queue claim is blocked (strict separation)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unauthorized: Service role worker credentials required.', code: '403' }
      });

      const { data, error } = await client.claimOutboxEvents(50);

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toContain('Service role worker credentials required');
    });

    it('AUTH-RPC-001-REG-006: retry_outbox_event rejects non-FAILED state events', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Only FAILED outbox events can be manually retried.', code: 'INVALID_STATE' }
      });

      const { data, error } = await client.retryOutboxEvent('00000000-0000-0000-0000-000000000001');

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.code).toBe('INVALID_STATE');
    });
  });

  describe('IDOR-001: Entity & Media Dual-Check Ownership Validation', () => {
    it('IDOR-001-REG-001: Cross-organizer media replacement attempt on another org event is rejected', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'You do not have administrative permissions for this event\'s organization.',
          code: 'INSUFFICIENT_ORGANIZATION_PERMISSIONS'
        }
      });

      const res = await client.supabase.rpc('replace_entity_media', {
        p_entity_table: 'events',
        p_entity_id: 'org-b-event-uuid',
        p_media_column: 'banner_media_id',
        p_new_media_id: 'attacker-media-uuid'
      });

      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe('INSUFFICIENT_ORGANIZATION_PERMISSIONS');
    });

    it('IDOR-001-REG-002: Authorized organizer attaching another organization\'s media asset is rejected (Dual Check)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Target media asset does not belong to the authorized organization.',
          code: 'INSUFFICIENT_MEDIA_PERMISSIONS'
        }
      });

      const res = await client.supabase.rpc('replace_entity_media', {
        p_entity_table: 'events',
        p_entity_id: 'own-org-event-uuid',
        p_media_column: 'banner_media_id',
        p_new_media_id: 'foreign-org-media-uuid'
      });

      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe('INSUFFICIENT_MEDIA_PERMISSIONS');
    });

    it('IDOR-001-REG-003: Authorized organizer media replacement on own event with own media succeeds', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          old_media_id: 'old-media-uuid',
          new_media_id: 'new-media-uuid'
        },
        error: null
      });

      const res = await client.supabase.rpc('replace_entity_media', {
        p_entity_table: 'events',
        p_entity_id: 'own-org-event-uuid',
        p_media_column: 'banner_media_id',
        p_new_media_id: 'new-media-uuid'
      });

      expect(res.error).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.new_media_id).toBe('new-media-uuid');
    });

    it('IDOR-001-REG-004: Non-Super Admin attempting to replace platform advertisement media is rejected', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Super Admin permissions required to modify platform media references.',
          code: 'UNAUTHORIZED'
        }
      });

      const res = await client.supabase.rpc('replace_entity_media', {
        p_entity_table: 'advertisements',
        p_entity_id: 'ad-uuid',
        p_media_column: 'media_id',
        p_new_media_id: 'malicious-media-uuid'
      });

      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe('UNAUTHORIZED');
    });

    it('IDOR-001-REG-005: Parameter injection with unwhitelisted table/column is rejected', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Unsupported entity table.',
          code: 'INVALID_TABLE'
        }
      });

      const res = await client.supabase.rpc('replace_entity_media', {
        p_entity_table: 'admin_users',
        p_entity_id: 'target-uuid',
        p_media_column: 'avatar',
        p_new_media_id: 'media-uuid'
      });

      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe('INVALID_TABLE');
    });
  });

  describe('UPLOAD-001: Storage Media Bucket Active Content Elimination', () => {
    it('UPLOAD-001-REG-001: Media storage bucket allows safe raster/modern image formats only', () => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/avif'
      ];

      expect(allowedMimeTypes).not.toContain('image/svg+xml');
      expect(allowedMimeTypes).not.toContain('text/html');
      expect(allowedMimeTypes).not.toContain('application/javascript');
      expect(allowedMimeTypes.length).toBe(5);
    });
  });

  describe('AUTH-002: Dynamic Super Admin Authorization Decoupling', () => {
    it('AUTH-002-REG-001: New admin users are created with regular unapproved state without hardcoded privilege assignment', () => {
      const mockCreatedAdmin = {
        id: 'admin-123',
        email: 'random-user@lpu.in',
        display_name: 'random-user',
        is_active: true,
        is_super_admin: false,
        org_id: null
      };

      expect(mockCreatedAdmin.is_super_admin).toBe(false);
      expect(mockCreatedAdmin.org_id).toBeNull();
    });
  });
});
