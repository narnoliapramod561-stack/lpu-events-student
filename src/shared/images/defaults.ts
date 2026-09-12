/**
 * defaults.ts
 * Comprehensive Default Image Asset Registry for LPU Events
 * Maps Categories and Subcategories (by UUID, Slug Key, and Display Name)
 * to dedicated production-quality 16:9 widescreen WebP assets.
 */

export interface SubcategoryImageMeta {
  categoryKey: string;
  subcategoryKey: string;
  webp: string;
  jpg: string;
}

// Category UUID -> Key Mapping
export const CATEGORY_UUID_MAP: Record<string, string> = {
  'c4444444-4444-4444-4444-444444444444': 'academics',
  'c2222222-2222-2222-2222-222222222222': 'cultural',
  'c1111111-1111-1111-1111-111111111111': 'innovation',
  'c4000000-0000-0000-0000-000000000001': 'entrepreneurship',
  'c5000000-0000-0000-0000-000000000001': 'schools',
  'c6000000-0000-0000-0000-000000000001': 'community-services',
  'c7000000-0000-0000-0000-000000000001': 'day-celebrations',
  'c3333333-3333-3333-3333-333333333333': 'co-curricular',
  'c9000000-0000-0000-0000-000000000001': 'student-clubs',
  'ca000000-0000-0000-0000-000000000001': 'ncc',
  'cb000000-0000-0000-0000-000000000001': 'nss',
  'cc000000-0000-0000-0000-000000000001': 'fashion',
  'cd000000-0000-0000-0000-000000000001': 'others'
};

// Subcategory UUID -> { categoryKey, subcategoryKey } Mapping
export const SUBCATEGORY_UUID_MAP: Record<string, { categoryKey: string; subcategoryKey: string }> = {
  // Academics
  'ba100001-0000-0000-0000-000000000001': { categoryKey: 'academics', subcategoryKey: 'seminar' },
  'ba100001-0000-0000-0000-000000000002': { categoryKey: 'academics', subcategoryKey: 'guest-lecture' },
  'b5555555-5555-5555-5555-555555555555': { categoryKey: 'academics', subcategoryKey: 'workshop' },
  'ba100001-0000-0000-0000-000000000003': { categoryKey: 'academics', subcategoryKey: 'internship' },
  'ba100001-0000-0000-0000-000000000004': { categoryKey: 'academics', subcategoryKey: 'capstone' },
  'ba100001-0000-0000-0000-000000000005': { categoryKey: 'academics', subcategoryKey: 'others' },

  // Cultural
  'b3333333-3333-3333-3333-333333333333': { categoryKey: 'cultural', subcategoryKey: 'music' },
  'b2020002-0000-0000-0000-000000000001': { categoryKey: 'cultural', subcategoryKey: 'dance' },
  'b2020002-0000-0000-0000-000000000002': { categoryKey: 'cultural', subcategoryKey: 'theatre' },
  'ba200002-0000-0000-0000-000000000001': { categoryKey: 'cultural', subcategoryKey: 'social-media' },
  'ba200002-0000-0000-0000-000000000002': { categoryKey: 'cultural', subcategoryKey: 'others' },

  // Innovation
  'b1111111-1111-1111-1111-111111111111': { categoryKey: 'innovation', subcategoryKey: 'hackathon' },
  'b2222222-2222-2222-2222-222222222222': { categoryKey: 'innovation', subcategoryKey: 'technical-events' },
  'ba300003-0000-0000-0000-000000000001': { categoryKey: 'innovation', subcategoryKey: 'project-expo' },
  'ba300003-0000-0000-0000-000000000002': { categoryKey: 'innovation', subcategoryKey: 'workshop' },
  'ba300003-0000-0000-0000-000000000003': { categoryKey: 'innovation', subcategoryKey: 'seminar' },
  'ba300003-0000-0000-0000-000000000004': { categoryKey: 'innovation', subcategoryKey: 'others' },

  // Entrepreneurship
  'ba400004-0000-0000-0000-000000000001': { categoryKey: 'entrepreneurship', subcategoryKey: 'b-plan' },
  'ba400004-0000-0000-0000-000000000002': { categoryKey: 'entrepreneurship', subcategoryKey: 'pitch-fest' },
  'ba400004-0000-0000-0000-000000000003': { categoryKey: 'entrepreneurship', subcategoryKey: 'conclave' },
  'ba400004-0000-0000-0000-000000000004': { categoryKey: 'entrepreneurship', subcategoryKey: 'bootcamp' },
  'ba400004-0000-0000-0000-000000000005': { categoryKey: 'entrepreneurship', subcategoryKey: 'panel-discussion' },
  'ba400004-0000-0000-0000-000000000006': { categoryKey: 'entrepreneurship', subcategoryKey: 'expo' },
  'ba400004-0000-0000-0000-000000000007': { categoryKey: 'entrepreneurship', subcategoryKey: 'seminar' },
  'ba400004-0000-0000-0000-000000000008': { categoryKey: 'entrepreneurship', subcategoryKey: 'others' },

  // Schools: Engineering & Tech
  'ba500005-0000-0000-0000-000000000001': { categoryKey: 'schools', subcategoryKey: 'school-ai-emerging' },
  'ba500005-0000-0000-0000-000000000002': { categoryKey: 'schools', subcategoryKey: 'school-bio' },
  'ba500005-0000-0000-0000-000000000003': { categoryKey: 'schools', subcategoryKey: 'school-chemical' },
  'ba500005-0000-0000-0000-000000000004': { categoryKey: 'schools', subcategoryKey: 'school-ca' },
  'ba500005-0000-0000-0000-000000000005': { categoryKey: 'schools', subcategoryKey: 'school-cse' },
  'ba500005-0000-0000-0000-000000000006': { categoryKey: 'schools', subcategoryKey: 'school-cai' },
  'ba500005-0000-0000-0000-000000000007': { categoryKey: 'schools', subcategoryKey: 'school-eee' },
  'ba500005-0000-0000-0000-000000000008': { categoryKey: 'schools', subcategoryKey: 'school-me' },

  // Schools: Arts, Design & Architecture
  'ba500005-0000-0000-0000-000000000009': { categoryKey: 'schools', subcategoryKey: 'school-arch' },
  'ba500005-0000-0000-0000-000000000010': { categoryKey: 'schools', subcategoryKey: 'school-design-fashion' },
  'ba500005-0000-0000-0000-000000000011': { categoryKey: 'schools', subcategoryKey: 'school-design-interior' },
  'ba500005-0000-0000-0000-000000000012': { categoryKey: 'schools', subcategoryKey: 'school-design-multimedia' },
  'ba500005-0000-0000-0000-000000000013': { categoryKey: 'schools', subcategoryKey: 'school-arts-films' },
  'ba500005-0000-0000-0000-000000000014': { categoryKey: 'schools', subcategoryKey: 'school-arts-fine' },
  'ba500005-0000-0000-0000-000000000015': { categoryKey: 'schools', subcategoryKey: 'school-arts-journalism' },
  'ba500005-0000-0000-0000-000000000016': { categoryKey: 'schools', subcategoryKey: 'school-arts-social' },

  // Schools: Business, Law & Management
  'ba500005-0000-0000-0000-000000000017': { categoryKey: 'schools', subcategoryKey: 'school-business' },
  'ba500005-0000-0000-0000-000000000018': { categoryKey: 'schools', subcategoryKey: 'school-agriculture' },
  'ba500005-0000-0000-0000-000000000019': { categoryKey: 'schools', subcategoryKey: 'school-hotel-tourism' },
  'ba500005-0000-0000-0000-000000000020': { categoryKey: 'schools', subcategoryKey: 'school-law' },

  // Schools: Health, Education & Professional
  'ba500005-0000-0000-0000-000000000021': { categoryKey: 'schools', subcategoryKey: 'school-medical' },
  'ba500005-0000-0000-0000-000000000022': { categoryKey: 'schools', subcategoryKey: 'school-education' },
  'ba500005-0000-0000-0000-000000000023': { categoryKey: 'schools', subcategoryKey: 'school-phys-ed' },
  'ba500005-0000-0000-0000-000000000024': { categoryKey: 'schools', subcategoryKey: 'school-pharma' },
  'ba500005-0000-0000-0000-000000000025': { categoryKey: 'schools', subcategoryKey: 'school-polytechnic' },

  // Community Services
  'ba600006-0000-0000-0000-000000000001': { categoryKey: 'community-services', subcategoryKey: 'donation-drives' },
  'ba600006-0000-0000-0000-000000000002': { categoryKey: 'community-services', subcategoryKey: 'environment' },
  'ba600006-0000-0000-0000-000000000003': { categoryKey: 'community-services', subcategoryKey: 'healthcare' },
  'ba600006-0000-0000-0000-000000000004': { categoryKey: 'community-services', subcategoryKey: 'others' },

  // Day Celebrations
  'ba700007-0000-0000-0000-000000000001': { categoryKey: 'day-celebrations', subcategoryKey: 'national-days' },
  'ba700007-0000-0000-0000-000000000002': { categoryKey: 'day-celebrations', subcategoryKey: 'cultural-days' },
  'ba700007-0000-0000-0000-000000000003': { categoryKey: 'day-celebrations', subcategoryKey: 'fest-days' },
  'ba700007-0000-0000-0000-000000000004': { categoryKey: 'day-celebrations', subcategoryKey: 'awareness-days' },
  'ba700007-0000-0000-0000-000000000005': { categoryKey: 'day-celebrations', subcategoryKey: 'others' },

  // Co-Curricular
  'b4444444-4444-4444-4444-444444444444': { categoryKey: 'co-curricular', subcategoryKey: 'competitions' },
  'ba800008-0000-0000-0000-000000000001': { categoryKey: 'co-curricular', subcategoryKey: 'skill-dev' },
  'ba800008-0000-0000-0000-000000000002': { categoryKey: 'co-curricular', subcategoryKey: 'certifications' },
  'ba800008-0000-0000-0000-000000000003': { categoryKey: 'co-curricular', subcategoryKey: 'training' },
  'ba800008-0000-0000-0000-000000000004': { categoryKey: 'co-curricular', subcategoryKey: 'others' },

  // Student Clubs & Org
  'ba900009-0000-0000-0000-000000000001': { categoryKey: 'student-clubs', subcategoryKey: 'tech-clubs' },
  'ba900009-0000-0000-0000-000000000002': { categoryKey: 'student-clubs', subcategoryKey: 'cultural-clubs' },
  'ba900009-0000-0000-0000-000000000003': { categoryKey: 'student-clubs', subcategoryKey: 'startup-clubs' },
  'ba900009-0000-0000-0000-000000000004': { categoryKey: 'student-clubs', subcategoryKey: 'literary-clubs' },
  'ba900009-0000-0000-0000-000000000005': { categoryKey: 'student-clubs', subcategoryKey: 'others' },

  // NCC
  'baa0000a-0000-0000-0000-000000000001': { categoryKey: 'ncc', subcategoryKey: 'camps' },
  'baa0000a-0000-0000-0000-000000000002': { categoryKey: 'ncc', subcategoryKey: 'training' },
  'baa0000a-0000-0000-0000-000000000003': { categoryKey: 'ncc', subcategoryKey: 'parades' },
  'baa0000a-0000-0000-0000-000000000004': { categoryKey: 'ncc', subcategoryKey: 'others' },

  // NSS
  'bab0000b-0000-0000-0000-000000000001': { categoryKey: 'nss', subcategoryKey: 'social-work' },
  'bab0000b-0000-0000-0000-000000000002': { categoryKey: 'nss', subcategoryKey: 'campaigns' },
  'bab0000b-0000-0000-0000-000000000003': { categoryKey: 'nss', subcategoryKey: 'awareness-drives' },
  'bab0000b-0000-0000-0000-000000000004': { categoryKey: 'nss', subcategoryKey: 'others' },

  // Fashion
  'bac0000c-0000-0000-0000-000000000001': { categoryKey: 'fashion', subcategoryKey: 'shows' },
  'bac0000c-0000-0000-0000-000000000002': { categoryKey: 'fashion', subcategoryKey: 'exhibitions' },
  'bac0000c-0000-0000-0000-000000000003': { categoryKey: 'fashion', subcategoryKey: 'others' },

  // Others
  'bad0000d-0000-0000-0000-000000000001': { categoryKey: 'others', subcategoryKey: 'miscellaneous' }
};

/**
 * Resolves the primary default image URL for any event or category/subcategory pair.
 */
export function resolveDefaultEventImage(eventOrMeta: any): string {
  if (!eventOrMeta) return '/defaults/events/general_default.webp';

  // 1. Direct subcategory UUID lookup
  const subId = eventOrMeta.subcategory_id;
  if (subId && SUBCATEGORY_UUID_MAP[subId]) {
    const { categoryKey, subcategoryKey } = SUBCATEGORY_UUID_MAP[subId];
    return `/defaults/events/${categoryKey}_${subcategoryKey}.webp`;
  }

  // 2. Direct subcategories relation key/name lookup
  const subKey = eventOrMeta.subcategories?.key || eventOrMeta.subcategories?.name || eventOrMeta.subcategoryKey || eventOrMeta.subcategory;
  let catKey = eventOrMeta.categories?.key || eventOrMeta.categories?.name || eventOrMeta.categoryKey || eventOrMeta.category;
  
  if (eventOrMeta.category_id && CATEGORY_UUID_MAP[eventOrMeta.category_id]) {
    catKey = CATEGORY_UUID_MAP[eventOrMeta.category_id];
  }

  if (catKey && subKey && typeof subKey === 'string') {
    const cleanSub = String(subKey).toLowerCase().trim().replace(/[\s_&]+/g, '-').replace(/-+/g, '-');
    const cleanCat = String(catKey).toLowerCase().trim().replace(/[\s_&]+/g, '-').replace(/-+/g, '-');
    return `/defaults/events/${cleanCat}_${cleanSub}.webp`;
  }

  // 3. Category level fallback
  if (catKey && typeof catKey === 'string') {
    const cleanCat = String(catKey).toLowerCase().trim().replace(/[\s_&]+/g, '-').replace(/-+/g, '-');
    return `/defaults/events/${cleanCat}_default.webp`;
  }

  return '/defaults/events/general_default.webp';
}
