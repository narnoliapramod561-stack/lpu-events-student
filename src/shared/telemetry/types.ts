// packages/shared/src/telemetry/types.ts
// Authoritative telemetry type definitions for LPU Events

export type AppIdentifier = 'student' | 'admin';

export type TelemetryEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface PostHogConfig {
  apiKey?: string;
  apiHost?: string;
  app: AppIdentifier;
  environment?: TelemetryEnvironment;
  debug?: boolean;
}

export interface ClarityConfig {
  projectId?: string;
  maskAllText?: boolean;
}

export interface SentryConfig {
  dsn?: string;
  environment?: TelemetryEnvironment;
  release?: string;
  app: AppIdentifier;
  tracesSampleRate?: number;
}

export interface BaseEventProperties {
  app: AppIdentifier;
  timestamp?: string;
  [key: string]: any;
}

export interface RegistrationClickProperties extends BaseEventProperties {
  event_id: string;
  event_name: string;
  destination_domain: string;
  pricing_type: string;
}

export interface AdminActionProperties extends BaseEventProperties {
  action: string;
  target_resource?: string;
  resource_id?: string;
  success: boolean;
}
