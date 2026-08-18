import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initClarity, isClarityLoaded, setClarityTag, _resetClarityForTesting } from '../clarity';

describe('Microsoft Clarity Telemetry Module', () => {
  beforeEach(() => {
    _resetClarityForTesting();
    const existing = document.getElementById('ms-clarity-script');
    if (existing) existing.remove();
    delete (window as any).clarity;
  });


  afterEach(() => {
    const existing = document.getElementById('ms-clarity-script');
    if (existing) existing.remove();
  });

  it('should return false when no project ID is provided', () => {
    const initialized = initClarity({ projectId: '' });
    expect(initialized).toBe(false);
    expect(document.getElementById('ms-clarity-script')).toBeNull();
  });

  it('should inject clarity script tag when valid project ID is provided', () => {
    const initialized = initClarity({ projectId: 'test_clarity_project_id' });
    expect(initialized).toBe(true);

    const script = document.getElementById('ms-clarity-script') as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(script.src).toContain('test_clarity_project_id');
    expect(typeof window.clarity).toBe('function');
  });

  it('should not inject duplicate script tags when called repeatedly', () => {
    initClarity({ projectId: 'test_clarity_project_id' });
    initClarity({ projectId: 'test_clarity_project_id' });

    const scripts = document.querySelectorAll('#ms-clarity-script');
    expect(scripts.length).toBe(1);
  });

  it('should set clarity tag without throwing exceptions', () => {
    initClarity({ projectId: 'test_clarity_project_id' });
    expect(() => {
      setClarityTag('portal_view', 'student_discovery');
    }).not.toThrow();
  });
});
