// types.ts
// LPU Events authoritative frontend and backend type contracts

export type PlatformAdminRole = 'SUPER_ADMIN';
export type OrganizationMemberRole = 'ORGANIZER';
export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type EventStatus = 'PUBLISHED' | 'COMPLETED' | 'CANCELLED' | 'DRAFT' | 'DELETED';
export type RegistrationMode = 'NONE' | 'EXTERNAL';
export type EventPricingType = 'FREE' | 'PAID';
export type MediaType = 'EVENT_BANNER' | 'ADVERTISEMENT' | 'SPONSOR_LOGO' | 'CAROUSEL_IMAGE' | 'MEMORY_IMAGE';
export type MediaStatus = 'UPLOADING' | 'READY' | 'FAILED' | 'PENDING_DELETE' | 'DELETED';
export type AdvertisementStatus = 'active' | 'inactive';
export type CarouselItemType = 'EVENT' | 'ADVERTISEMENT' | 'MEMORY' | 'MEDIA';

export type CanonicalResourceType =
  | 'events'
  | 'categories'
  | 'ads'
  | 'featured'
  | 'memories'
  | 'carousel'
  | 'sponsors'
  | 'settings';

export type ResourceVersionMap = Record<CanonicalResourceType, number>;

export interface ResourceVersionItem {
  resource: CanonicalResourceType;
  version: number;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAdminRoleRecord {
  admin_user_id: string;
  role: PlatformAdminRole;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  logo_media_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  admin_user_id: string;
  role: OrganizationMemberRole;
  created_at: string;
}

export interface OrganizerAccessRequest {
  id: string;
  admin_user_id: string;
  organization_name: string;
  remarks: string | null;
  status: AccessRequestStatus;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  bucket: string;
  object_key: string;
  media_type: MediaType;
  mime_type: string;
  file_size_bytes: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  status: MediaStatus;
  created_by: string;
  created_at: string;
  verified_at: string | null;
  deleted_at: string | null;
}

export interface Event {
  id: string;
  organization_id: string;
  created_by: string;
  updated_by: string;
  name: string;
  description: string;
  category_id: string;
  subcategory_id: string | null;
  banner_media_id: string | null;
  start_at: string;
  end_at: string;
  venue_name: string;
  registration_mode: RegistrationMode;
  external_registration_url: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  pricing_type: EventPricingType;
  registration_format: 'INDIVIDUAL' | 'TEAM' | null;
  capacity_limit: number | null;
  capacity_counts_by: 'TEAMS' | 'STUDENTS' | null;
  team_pricing_mode: 'FIXED_TEAM_PRICE' | 'PER_MEMBER_PRICE' | null;
  price_amount: number;
  status: EventStatus;
  view_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface EventContentSection {
  id: string;
  event_id: string;
  section_type: string;
  title: string;
  content: any;
  sort_order: number;
}

export interface Category {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: string;
  category_id: string;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Advertisement {
  id: string;
  name: string;
  media_id: string;
  redirect_url: string | null;
  start_at: string;
  end_at: string;
  status: AdvertisementStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_media_id: string | null;
  tier: string;
  redirect_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface EventMemory {
  id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  status: EventStatus;
  created_by: string;
  created_at: string;
}

export interface CarouselItem {
  id: string;
  item_type: CarouselItemType;
  target_id: string | null;
  title: string;
  description: string | null;
  media_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PublishEventPayload {
  organization_id: string;
  name: string;
  description: string;
  venue_name: string;
  category_id: string;
  subcategory_id: string | null;
  banner_media_id: string | null;
  start_at: string;
  end_at: string;
  registration_mode: RegistrationMode;
  external_registration_url?: string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  pricing_type: EventPricingType;
  registration_format?: 'INDIVIDUAL' | 'TEAM' | null;
  capacity_limit?: number | null;
  capacity_counts_by?: 'TEAMS' | 'STUDENTS' | null;
  team_pricing_mode?: 'FIXED_TEAM_PRICE' | 'PER_MEMBER_PRICE' | null;
  price_amount?: number | null;
}

export interface ContentSectionInput {
  section_type: string;
  title: string;
  content: any;
  sort_order: number;
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

export type APIResponse<T> = 
  | { status: 'success'; data: T } 
  | { status: 'error'; error: APIError };

export interface AdminProfile {
  id: string;
  display_name: string;
  email: string;
  is_super_admin: boolean;
  org_id: string | null;
  org_name: string | null;
  org_role: string | null;
}

export interface SubcategoryFeedItem {
  id: string;
  key: string;
  name: string;
  sort_order: number;
}

export interface CategoryFeedItem {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  subcategories: SubcategoryFeedItem[];
}

export interface EventFeedItem {
  id: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
  venue_name: string;
  registration_mode: RegistrationMode;
  pricing_type: EventPricingType;
  price_amount?: number | null;
  external_registration_url?: string | null;
  registration_format?: 'INDIVIDUAL' | 'TEAM' | null;
  banner_media_id: string | null;
  status?: EventStatus;
  deleted_at?: string | null;
  organizations: {
    name: string;
  } | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  categories?: {
    name: string;
    key?: string;
  } | null;
  subcategories?: {
    name: string;
    key?: string;
  } | null;
  is_trending?: boolean;
  trending_sort_order?: number;
}

export interface TrendingEvent {
  event_id: string;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  events?: Event;
}

export interface CarouselItemFeedItem {
  id: string;
  item_type: CarouselItemType;
  event_id?: string | null;
  advertisement_id?: string | null;
  memory_id?: string | null;
  media_id?: string | null;
  sort_order: number;
  is_active: boolean;
  start_at?: string | null;
  end_at?: string | null;
  display_duration_ms?: number;
  custom_title?: string | null;
  custom_subtitle?: string | null;
  custom_cta_text?: string | null;
  custom_cta_url?: string | null;
  badge_text?: string | null;
  events?: {
    id: string;
    name: string;
    description: string;
    start_at: string;
    end_at: string;
    venue_name: string;
    registration_mode: RegistrationMode;
    pricing_type: EventPricingType;
    banner_media_id: string | null;
    status: EventStatus;
    deleted_at?: string | null;
    organizations: { name: string } | null;
    categories?: { name: string } | null;
  } | null;
  advertisements?: {
    id: string;
    name: string;
    redirect_url: string | null;
    media_id: string | null;
    status: AdvertisementStatus;
  } | null;
  event_memories?: {
    id: string;
    title: string;
    description: string | null;
    cover_media_id: string | null;
    status: EventStatus;
    media_assets?: {
      id: string;
      object_key: string;
    } | null;
    events?: any | null;
  } | null;
  media_assets?: {
    id: string;
    bucket: string;
    object_key: string;
  } | null;
}

export interface AdvertisementFeedItem {
  id: string;
  name: string;
  media_id: string;
  redirect_url: string | null;
  start_at: string;
  end_at: string;
  status: AdvertisementStatus;
  advertisement_positions: any | null;
}

export interface EventMemoryFeedItem {
  id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  cover_media_id: string | null;
  status: EventStatus;
  created_at?: string;
  events?: {
    id: string;
    name: string;
    status: EventStatus;
    start_at?: string;
    end_at?: string;
    venue_name?: string;
    organizations?: { name: string } | null;
    categories?: { name: string } | null;
  } | null;
  media_assets?: {
    id: string;
    object_key: string;
    bucket?: string;
  } | null;
  event_memory_media?: any[] | null;
}

export interface SponsorFeedItem {
  id: string;
  name: string;
  logo_media_id: string | null;
  tier: string;
  redirect_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface HappeningTodayAdInjection {
  enabled: boolean;
  advertisement_id: string | null;
  insert_after_slide: number; // 1-indexed (1 = after 1st slide, 2 = after 2nd slide, etc.)
  custom_badge?: string;
  custom_cta_text?: string;
}

export interface HappeningTodayConfig {
  slide_duration_ms: number;
  auto_advance: boolean;
  ad_injection: HappeningTodayAdInjection;
}

