import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SEO, Robots.txt, and Sitemap Specifications', () => {
  const rootDir = process.cwd();


  it('student robots.txt should allow indexing and reference sitemap', () => {
    const studentRobotsPath = path.join(rootDir, 'apps/student-web/public/robots.txt');
    expect(fs.existsSync(studentRobotsPath)).toBe(true);

    const content = fs.readFileSync(studentRobotsPath, 'utf8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Allow: /');
    expect(content).toContain('Sitemap: https://lpuevents.live/sitemap.xml');
  });

  it('admin robots.txt should strictly disallow all crawling', () => {
    const adminRobotsPath = path.join(rootDir, 'apps/admin-web/public/robots.txt');
    expect(fs.existsSync(adminRobotsPath)).toBe(true);

    const content = fs.readFileSync(adminRobotsPath, 'utf8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Disallow: /');
    expect(content).not.toContain('Allow: /');
  });

  it('admin index.html should have noindex directive and clarity mask attribute', () => {
    const adminHtmlPath = path.join(rootDir, 'apps/admin-web/index.html');
    expect(fs.existsSync(adminHtmlPath)).toBe(true);

    const content = fs.readFileSync(adminHtmlPath, 'utf8');
    expect(content).toContain('noindex');
    expect(content).toContain('nofollow');
    expect(content).toContain('data-clarity-mask="True"');
  });

  it('student index.html should have canonical link and Open Graph metadata', () => {
    const studentHtmlPath = path.join(rootDir, 'apps/student-web/index.html');
    expect(fs.existsSync(studentHtmlPath)).toBe(true);

    const content = fs.readFileSync(studentHtmlPath, 'utf8');
    expect(content).toContain('rel="canonical"');
    expect(content).toContain('property="og:title"');
    expect(content).toContain('property="og:description"');
    expect(content).toContain('name="google-site-verification"');
  });

  it('student sitemap.xml should be valid xml pointing to lpuevents.live', () => {
    const sitemapPath = path.join(rootDir, 'apps/student-web/public/sitemap.xml');
    expect(fs.existsSync(sitemapPath)).toBe(true);

    const content = fs.readFileSync(sitemapPath, 'utf8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<urlset');
    expect(content).toContain('https://lpuevents.live/');
  });

  it('database health check migration file should exist and define health_check function', () => {
    const migrationPath = path.join(rootDir, 'supabase/migrations/20260817000001_backend_health_check.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');
    expect(content).toContain('FUNCTION public.health_check()');
    expect(content).toContain('status');
    expect(content).toContain('database');
  });

  it('edge health function should exist and export a safe probe handler', () => {
    const edgeFuncPath = path.join(rootDir, 'supabase/functions/health/index.ts');
    expect(fs.existsSync(edgeFuncPath)).toBe(true);

    const content = fs.readFileSync(edgeFuncPath, 'utf8');
    expect(content).toContain('health_check');
    expect(content).toContain('edge_runtime');
  });
});
