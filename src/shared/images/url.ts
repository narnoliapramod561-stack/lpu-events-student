/**
 * url.ts
 * Centralized Image URL & Delivery Helper for LPU Events
 *
 * Frontend components request images exclusively by context:
 * e.g. getOptimizedImage(event, 'event-card')
 *      getOptimizedImage(slide, 'hero')
 *      getOptimizedImage(mediaId, 'event-banner')
 *
 * Handles Cloudflare R2 public domains, immutable cache URLs,
 * responsive srcset strings, and intelligent mock/fallback images.
 */

import { ImageContext, IMAGE_CONTEXT_CONFIGS } from './config';
import { resolveDefaultEventImage } from './defaults';

export interface OptimizedImageOptions {
  variant?: 'desktop' | 'tablet' | 'mobile';
  fallbackTopic?: string;
}

export interface OptimizedSrcSetResult {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
}

/**
 * Curated high-res event mock fallbacks by ID or media ID
 */
export const EVENT_MOCK_FALLBACK_IMAGES: Record<string, string> = {
  // Day 0 (Today)
  'e0000000-0000-0000-0000-000000000001': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000001': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000002': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000002': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000003': 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000003': 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000004': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000004': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop',

  // Day 1 (+1 Day)
  'e0000000-0000-0000-0000-000000000005': 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000005': 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000006': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000006': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000007': 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000007': 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000008': 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000008': 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?q=80&w=1200&auto=format&fit=crop',

  // Day 2 (+2 Days)
  'e0000000-0000-0000-0000-000000000009': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000009': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000010': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000010': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000011': 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000011': 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000012': 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000012': 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=1200&auto=format&fit=crop',

  // Day 3 (+3 Days)
  'e0000000-0000-0000-0000-000000000013': 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000013': 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000014': 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000014': 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000015': 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000015': 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000016': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000016': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop',

  // Day 4 (+4 Days)
  'e0000000-0000-0000-0000-000000000017': 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000017': 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000018': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000018': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000019': 'https://images.unsplash.com/photo-1613918108466-292b78a8ef95?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000019': 'https://images.unsplash.com/photo-1613918108466-292b78a8ef95?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000020': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000020': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',

  // Day 5 (+5 Days)
  'e0000000-0000-0000-0000-000000000021': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000021': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000022': 'https://images.unsplash.com/photo-1585699324551-f6c309eedec6?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000022': 'https://images.unsplash.com/photo-1585699324551-f6c309eedec6?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000023': 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000023': 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000024': 'https://images.unsplash.com/photo-1558441719-8b489c652756?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000024': 'https://images.unsplash.com/photo-1558441719-8b489c652756?q=80&w=1200&auto=format&fit=crop',

  // Day 6 (+6 Days)
  'e0000000-0000-0000-0000-000000000025': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000025': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000026': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000026': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000027': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000027': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000028': 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000028': 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?q=80&w=1200&auto=format&fit=crop',

  // Day 7 (+7 Days)
  'e0000000-0000-0000-0000-000000000029': 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000029': 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000030': 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000030': 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000031': 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000031': 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000032': 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000032': 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=1200&auto=format&fit=crop',

  // Day 8 (+8 Days)
  'e0000000-0000-0000-0000-000000000033': 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000033': 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000034': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000034': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000035': 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000035': 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000036': 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000036': 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1200&auto=format&fit=crop',

  // Day 9 (+9 Days)
  'e0000000-0000-0000-0000-000000000037': 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000037': 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000038': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000038': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000039': 'https://images.unsplash.com/photo-1530549387789-4c1017266635?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000039': 'https://images.unsplash.com/photo-1530549387789-4c1017266635?q=80&w=1200&auto=format&fit=crop',
  'e0000000-0000-0000-0000-000000000040': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1200&auto=format&fit=crop',
  'de000000-0000-0000-0000-000000000040': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1200&auto=format&fit=crop',

  // Ads & Sponsors & General Media
  'd1111111-1111-1111-1111-111111111111': 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1200&auto=format&fit=crop',
  'd2222222-2222-2222-2222-222222222222': 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1200&auto=format&fit=crop',
  'd3333333-3333-3333-3333-333333333333': 'https://images.unsplash.com/photo-1573164713988-8665fc963095?q=80&w=800&auto=format&fit=crop',
  'd4444444-4444-4444-4444-444444444444': 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1200&auto=format&fit=crop',
  'a1111111-1111-1111-1111-111111111111': 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1200&auto=format&fit=crop',
  'a2222222-2222-2222-2222-222222222222': 'https://images.unsplash.com/photo-1531482615713-2afd69097998?q=80&w=1200&auto=format&fit=crop',
};

/**
 * Returns a topic-matched fallback image based on event name / description keywords
 */
export function getKeywordFallbackImage(nameOrText: string): string {
  const text = (nameOrText || '').toLowerCase();

  if (text.includes('robo') || text.includes('bot') || text.includes('hardware') || text.includes('drone')) {
    return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('dance') || text.includes('folk') || text.includes('garba') || text.includes('bhangra') || text.includes('hip-hop') || text.includes('street dance')) {
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('music') || text.includes('sitar') || text.includes('band') || text.includes('vocal') || text.includes('acoustic') || text.includes('dj') || text.includes('rock') || text.includes('concert')) {
    return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('game') || text.includes('esport') || text.includes('valorant') || text.includes('bgmi') || text.includes('lan') || text.includes('gaming')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('ai') || text.includes('genai') || text.includes('prompt') || text.includes('gemini') || text.includes('llm') || text.includes('machine learning')) {
    return 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('pitch') || text.includes('startup') || text.includes('entrepreneur') || text.includes('investor') || text.includes('conclave') || text.includes('b-plan')) {
    return 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('cricket') || text.includes('sports') || text.includes('football') || text.includes('badminton') || text.includes('basket') || text.includes('tennis') || text.includes('marathon') || text.includes('swimming') || text.includes('table tennis') || text.includes('volleyball')) {
    return 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('design') || text.includes('figma') || text.includes('ui/ux') || text.includes('prototype') || text.includes('graphics')) {
    return 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('cyber') || text.includes('ctf') || text.includes('security') || text.includes('hacker') || text.includes('penetration')) {
    return 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('hackathon') || text.includes('code') || text.includes('dev') || text.includes('programming') || text.includes('react') || text.includes('next.js') || text.includes('web3') || text.includes('blockchain')) {
    return 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('drama') || text.includes('theatre') || text.includes('play') || text.includes('natak') || text.includes('comedy') || text.includes('open mic') || text.includes('poetry') || text.includes('kavi')) {
    return 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('cloud') || text.includes('devops') || text.includes('kubernetes') || text.includes('quantum') || text.includes('data science') || text.includes('kaggle')) {
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('fashion') || text.includes('runway') || text.includes('model') || text.includes('styling')) {
    return 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('photo') || text.includes('film') || text.includes('expo') || text.includes('gallery')) {
    return 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('placement') || text.includes('career') || text.includes('interview') || text.includes('resume')) {
    return 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1200&auto=format&fit=crop';
  }
  if (text.includes('space') || text.includes('satellite') || text.includes('astronomy') || text.includes('nasa') || text.includes('isro')) {
    return 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1200&auto=format&fit=crop';
  }

  return 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?q=80&w=1200&auto=format&fit=crop';
}

/**
 * Resolves the base CDN / Storage URL for Cloudflare R2 Delivery
 */
/**
 * Resolves the base CDN / Storage URL for Cloudflare R2 Delivery
 */
export function getStorageBaseUrl(_bucket?: string): string {
  // 1. Check browser Vite env (import.meta.env)
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const r2Url = (import.meta as any).env.VITE_R2_PUBLIC_URL;
      if (r2Url && typeof r2Url === 'string' && r2Url.trim()) {
        return r2Url.trim().replace(/\/+$/, '');
      }
    }
  } catch {}

  // 2. Check Node / Process env
  try {
    const globalEnv = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : (typeof process !== 'undefined' ? process.env : undefined);
    const r2Url = globalEnv?.VITE_R2_PUBLIC_URL || globalEnv?.EXPO_PUBLIC_R2_PUBLIC_URL;
    if (r2Url && typeof r2Url === 'string' && r2Url.trim()) {
      return r2Url.trim().replace(/\/+$/, '');
    }
  } catch {}

  // 3. Authoritative default: Cloudflare R2 delivery domain (zero Supabase egress)
  return 'https://images.lpuevents.live';
}

/**
 * Primary Centralized Image URL Resolver
 * Directly maps uploaded media assets from Cloudflare R2 CDN or Supabase Storage.
 * No synthetic stock photo fallbacks.
 */
export function getOptimizedImage(
  source: any,
  context: ImageContext = 'event-card',
  options: OptimizedImageOptions = {}
): string {
  if (!source) {
    return '';
  }

  // 1. Direct string URL, data URL, blob URL, or object key
  if (typeof source === 'string') {
    const str = source.trim();
    if (!str) return '';
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  // 2. Direct banner_url or public_url on entity
  if (source.banner_url && typeof source.banner_url === 'string' && source.banner_url.trim()) {
    const str = source.banner_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.image_url && typeof source.image_url === 'string' && source.image_url.trim()) {
    const str = source.image_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.public_url && typeof source.public_url === 'string' && source.public_url.trim()) {
    const str = source.public_url.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  if (source.image && typeof source.image === 'string' && source.image.trim()) {
    const str = source.image.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:') || str.startsWith('blob:')) {
      return str;
    }
    return `${getStorageBaseUrl()}/${str.replace(/^\/+/, '')}`;
  }

  // 3. Media asset relation from database (handles both object and array shapes)
  const mediaAsset = Array.isArray(source.media_assets)
    ? source.media_assets[0]
    : (source.media_assets || (Array.isArray(source.media_asset) ? source.media_asset[0] : source.media_asset));

  if (mediaAsset?.object_key) {
    const key = mediaAsset.object_key;
    const bucket = mediaAsset.bucket;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl(bucket)}/${key.replace(/^\/+/, '')}`;
  }

  if (source.banner_object_key) {
    const key = source.banner_object_key;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl()}/${key.replace(/^\/+/, '')}`;
  }

  if (source.object_key) {
    const key = source.object_key;
    const bucket = source.bucket;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('blob:')) {
      return key;
    }
    return `${getStorageBaseUrl(bucket)}/${key.replace(/^\/+/, '')}`;
  }

  // 4. Nested relation sources (Carousel Slide / Item)
  if (source.events) {
    return getOptimizedImage(source.events, context, options);
  }
  if (source.advertisements) {
    return getOptimizedImage(source.advertisements, context, options);
  }
  if (source.event_memories) {
    return getOptimizedImage(source.event_memories, context, options);
  }

  // 5. Never fall back to event category images for advertisements
  if (
    context === 'advertisement' ||
    Boolean(source.redirect_url) ||
    source.item_type === 'advertisement' ||
    source.item_type === 'ADVERTISEMENT' ||
    Boolean(source.advertisements)
  ) {
    return '';
  }

  // 6. Category / Subcategory Taxonomy Fallback (Official Default WebP Images)
  const defaultImage = resolveDefaultEventImage(source);
  if (defaultImage) {
    return defaultImage;
  }

  // 6. Curated Mock / Fallback ID Map
  if (source.id && EVENT_MOCK_FALLBACK_IMAGES[source.id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.id];
  }
  if (source.banner_media_id && EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id]) {
    return EVENT_MOCK_FALLBACK_IMAGES[source.banner_media_id];
  }

  return '/defaults/events/general_default.webp';
}

/**
 * Returns responsive srcSet attributes for rich HTML picture / img tags
 */
export function getOptimizedImageSrcSet(
  source: any,
  context: ImageContext = 'event-card'
): OptimizedSrcSetResult {
  const config = IMAGE_CONTEXT_CONFIGS[context] || IMAGE_CONTEXT_CONFIGS['event-card'];
  const baseSrc = getOptimizedImage(source, context);

  let srcSet: string | undefined = undefined;
  let sizes: string | undefined = undefined;

  if (baseSrc.includes('_desktop.webp')) {
    const mobileSrc = baseSrc.replace('_desktop.webp', '_mobile.webp');
    const tabletSrc = baseSrc.replace('_desktop.webp', '_tablet.webp');
    srcSet = `${mobileSrc} 640w, ${tabletSrc} 1024w, ${baseSrc} ${config.maxWidth}w`;
    sizes = `(max-width: 640px) 100vw, (max-width: 1024px) 80vw, ${config.maxWidth}px`;
  }

  return {
    src: baseSrc,
    srcSet,
    sizes,
    width: config.maxWidth,
    height: config.maxHeight
  };
}
