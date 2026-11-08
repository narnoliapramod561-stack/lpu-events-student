import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

describe('SEO, Robots.txt, and Sitemap Specifications', () => {
  const rootDir = process.cwd();

  it('student worker should provide dynamic robots.txt with indexing allowed and sitemap reference', () => {
    const workerPath = path.join(rootDir, 'lpu-events-student/src/worker.ts');
    assert.ok(fs.existsSync(workerPath));

    const content = fs.readFileSync(workerPath, 'utf8');
    assert.ok(content.includes('User-agent: *'));
    assert.ok(content.includes('Allow: /'));
    assert.ok(content.includes('sitemap.xml'));
  });

  it('admin robots.txt should strictly disallow all crawling', () => {
    const adminRobotsPath = fs.existsSync(path.join(rootDir, 'lpu-events-admin/public/robots.txt'))
      ? path.join(rootDir, 'lpu-events-admin/public/robots.txt')
      : path.join(rootDir, 'apps/admin-web/public/robots.txt');
    assert.ok(fs.existsSync(adminRobotsPath));

    const content = fs.readFileSync(adminRobotsPath, 'utf8');
    assert.ok(content.includes('User-agent: *'));
    assert.ok(content.includes('Disallow: /'));
    assert.ok(!content.includes('Allow: /'));
  });

  it('admin index.html should have noindex directive', () => {
    const adminHtmlPath = fs.existsSync(path.join(rootDir, 'lpu-events-admin/index.html'))
      ? path.join(rootDir, 'lpu-events-admin/index.html')
      : path.join(rootDir, 'apps/admin-web/index.html');
    assert.ok(fs.existsSync(adminHtmlPath));

    const content = fs.readFileSync(adminHtmlPath, 'utf8');
    assert.ok(content.includes('noindex'));
    assert.ok(content.includes('nofollow'));
  });

  it('student index.html should have canonical link and Open Graph metadata', () => {
    const studentHtmlPath = fs.existsSync(path.join(rootDir, 'lpu-events-student/index.html'))
      ? path.join(rootDir, 'lpu-events-student/index.html')
      : path.join(rootDir, 'apps/student-web/index.html');
    assert.ok(fs.existsSync(studentHtmlPath));

    const content = fs.readFileSync(studentHtmlPath, 'utf8');
    assert.ok(content.includes('rel="canonical"'));
    assert.ok(content.includes('property="og:title"'));
    assert.ok(content.includes('property="og:description"'));
    assert.ok(content.includes('name="google-site-verification"'));
  });

  it('student worker should provide dynamic sitemap.xml with valid xml urlset', () => {
    const workerPath = path.join(rootDir, 'lpu-events-student/src/worker.ts');
    assert.ok(fs.existsSync(workerPath));

    const content = fs.readFileSync(workerPath, 'utf8');
    assert.ok(content.includes('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(content.includes('<urlset'));
    assert.ok(content.includes('/sitemap.xml'));
  });

  it('database health check migration file should exist and define health_check function', () => {
    const migrationPath = path.join(rootDir, 'supabase/migrations/20260817000001_backend_health_check.sql');
    assert.ok(fs.existsSync(migrationPath));

    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes('FUNCTION public.health_check()'));
    assert.ok(content.includes('status'));
    assert.ok(content.includes('database'));
  });

  it('edge health function should exist and export a safe probe handler', () => {
    const edgeFuncPath = fs.existsSync(path.join(rootDir, 'lpu-events-student/supabase/functions/health/index.ts'))
      ? path.join(rootDir, 'lpu-events-student/supabase/functions/health/index.ts')
      : path.join(rootDir, 'supabase/functions/health/index.ts');
    assert.ok(fs.existsSync(edgeFuncPath));

    const content = fs.readFileSync(edgeFuncPath, 'utf8');
    assert.ok(content.includes('health_check'));
    assert.ok(content.includes('edge_runtime'));
  });
});
