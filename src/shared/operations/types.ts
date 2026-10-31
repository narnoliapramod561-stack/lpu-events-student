// src/shared/operations/types.ts
// LPU Events — Super Admin Operations Control Plane Types (Phase 2 Foundation)

export type OperationsErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'DIAGNOSTIC_FAILED'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT';

export type OperationsServiceStatus =
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'DEGRADED'
  | 'UNKNOWN'
  | 'NOT_MONITORED'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE';

export interface OperationsMeta {
  generated_at: string;
  duration_ms: number;
  source: string;
  environment: string;
}

export interface OperationsSuccessResponse<T> {
  success: true;
  request_id: string;
  correlation_id: string;
  data: T;
  meta: OperationsMeta;
}

export interface OperationsErrorDetail {
  code: OperationsErrorCode;
  message: string;
}

export interface OperationsErrorResponse {
  success: false;
  request_id: string;
  correlation_id: string;
  error: OperationsErrorDetail;
  meta: OperationsMeta;
}

export type OperationsResponse<T> = OperationsSuccessResponse<T> | OperationsErrorResponse;

export interface OperationsCapabilityMap {
  health_probe: boolean;
  request_usage: boolean;
  quota_metrics: boolean;
  error_rates: boolean;
}

export interface OperationsServiceDefinition {
  key: string;
  displayName: string;
  provider: string;
  category: 'database' | 'auth' | 'compute' | 'storage' | 'email' | 'observability' | 'ci_cd';
  criticality: 'tier_0_core' | 'tier_1_critical' | 'tier_2_standard';
  monitoringStatus: OperationsServiceStatus;
  capabilities: OperationsCapabilityMap;
  notes: string;
}

export interface OperationsProviderStatus {
  provider: string;
  displayName: string;
  isConfigured: boolean;
  phase: string;
  note: string;
}

export interface OperationsDatabaseDiagnostics {
  status: OperationsServiceStatus;
  latency_ms: number;
  connections: {
    active_now: number | 'NOT_AVAILABLE';
    idle: number | 'NOT_AVAILABLE';
    total_non_idle: number | 'NOT_AVAILABLE';
  };
  storage: {
    database_size_pretty: string | 'NOT_AVAILABLE';
  };
  metadata_counts: {
    admin_users_total: number;
    events_total: number;
  };
  timestamp: string;
}

export interface OperationsOverview {
  overall_status: string;
  gateway: {
    status: string;
    runtime: string;
  };
  services_summary: {
    total_registered: number;
    monitored_in_phase_2: number;
    unmonitored: number;
  };
  providers_summary: {
    total: number;
    configured_server_credentials: number;
  };
  database_health: string;
  phase: string;
  jobs_summary?: {
    total_jobs: number;
    healthy_jobs: number;
    running_jobs: number;
    stale_jobs: number;
    failed_jobs: number;
  };
  incidents_summary?: {
    open: number;
    acknowledged: number;
    critical: number;
    high: number;
  };
  alerts_summary?: {
    open_critical: number;
    open_high: number;
    open_warning: number;
    total_open: number;
  };
  notifications_summary?: {
    pending: number;
    failed: number;
    provider_configured: boolean;
  };
  remediation_summary?: {
    total_runbooks: number;
    pending_approvals: number;
    completed_today: number;
    failed_today: number;
  };
  resilience_summary?: {
    total_scenarios: number;
    runs_today: number;
    pass_rate: number;
  };
  governance_summary?: {
    slo_compliance_rate: number;
    error_budgets_exhausted: number;
    capacity_critical_count: number;
    production_readiness: 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY' | 'UNKNOWN';
  };
  latest_collection_run?: {
    id?: string;
    status?: string;
    started_at: string;
    completed_at?: string;
    metrics_collected?: number;
    errors_count?: number;
  } | null;
}

export interface OperationsMetricSnapshot {
  id: string;
  service_id: string;
  metric_key: string;
  metric_value: number | null;
  metric_limit: number | null;
  unit: string;
  status: OperationsServiceStatus;
  source: string;
  captured_at: string;
  age_seconds: number;
  is_stale: boolean;
  metadata?: Record<string, unknown>;
}

export interface OperationsHealthProbe {
  id: string;
  service_id: string;
  probe_key: string;
  success: boolean;
  status: string;
  latency_ms: number;
  status_code?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  checked_at: string;
  metadata?: Record<string, unknown>;
}

export interface OperationsCollectionResult {
  runId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'LOCKED';
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  metricsCollected: number;
  errorsCount: number;
  providerSummaries: Record<string, {
    isConfigured: boolean;
    metricsCount: number;
    probesCount: number;
    errors: string[];
  }>;
  latestProbes: OperationsHealthProbe[];
}

export interface OperationsJob {
  id: string;
  job_key: string;
  display_name: string;
  description: string;
  job_type: 'DATABASE' | 'STORAGE' | 'TELEMETRY' | 'MAINTENANCE' | 'SYNC' | 'OTHER';
  schedule_description: string;
  expected_interval_minutes: number | null;
  enabled: boolean;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  owner: string;
  source: string;
  metadata: Record<string, unknown>;
  health: 'HEALTHY' | 'RUNNING' | 'PARTIAL' | 'FAILED' | 'STALE' | 'DISABLED' | 'UNKNOWN';
  is_running: boolean;
  is_stale: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_duration_ms: number | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_summary: string | null;
}

export interface OperationsJobRun {
  id: string;
  job_id: string;
  status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  trigger_source: string;
  records_scanned: number;
  records_processed: number;
  records_deleted: number;
  records_failed: number;
  error_code: string | null;
  error_summary: string | null;
  request_id?: string | null;
  correlation_id?: string | null;
  metadata: Record<string, unknown>;
  ops_jobs?: {
    job_key: string;
    display_name: string;
    job_type: string;
  };
}

export interface OperationsMaintenanceOverview {
  summary: {
    total_jobs: number;
    healthy_jobs: number;
    running_jobs: number;
    stale_jobs: number;
    failed_jobs: number;
    partial_jobs: number;
    disabled_jobs: number;
  };
  jobs: OperationsJob[];
  github_actions_reconciliation: {
    isConfigured: boolean;
    status: string;
    message?: string;
    repository?: string;
    recent_runs?: any[];
  };
}

// ============================================================================
// Phase 5: Alert & Incident Engine Types
// ============================================================================

export type OperationsSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type OperationsAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type OperationsIncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type OperationsIncidentEventType =
  | 'INCIDENT_OPENED'
  | 'ALERT_CREATED'
  | 'ALERT_OCCURRED_AGAIN'
  | 'SEVERITY_CHANGED'
  | 'INCIDENT_ACKNOWLEDGED'
  | 'INCIDENT_RESOLVED'
  | 'ALERT_RESOLVED';

export interface OperationsAlertRule {
  id: string;
  rule_key: string;
  name: string;
  description: string;
  service_id: string;
  metric_key?: string | null;
  condition_type: string;
  operator: string;
  threshold_value?: number | null;
  secondary_threshold_value?: number | null;
  window_minutes: number;
  evaluation_interval_minutes: number;
  severity: OperationsSeverity;
  enabled: boolean;
  cooldown_minutes: number;
  recovery_enabled: boolean;
  consecutive_count_threshold: number;
  recovery_consecutive_threshold: number;
  incident_group_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OperationsAlert {
  id: string;
  rule_id: string;
  service_id: string;
  incident_id?: string | null;
  severity: OperationsSeverity;
  status: OperationsAlertStatus;
  title: string;
  message: string;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at?: string | null;
  occurrence_count: number;
  last_value?: number | null;
  threshold_value?: number | null;
  evidence: Record<string, unknown>;
  consecutive_failures: number;
  consecutive_successes: number;
  ops_alert_rules?: {
    id?: string;
    rule_key: string;
    name: string;
    description?: string;
    condition_type: string;
    operator: string;
    threshold_value?: number | null;
  };
  ops_incidents?: {
    id: string;
    incident_key: string;
    title: string;
    severity: OperationsSeverity;
    status: OperationsIncidentStatus;
  };
}

export type OperationsResolutionType = 'AUTO_RECOVERY' | 'MANUAL';

export interface OperationsIncident {
  id: string;
  incident_key: string;
  title: string;
  description: string;
  severity: OperationsSeverity;
  status: OperationsIncidentStatus;
  resolution_type?: OperationsResolutionType | null;
  service_id: string;
  group_key: string;
  opened_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_reason?: string | null;
  last_activity_at: string;
  primary_alert_id?: string | null;
  correlation_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OperationsIncidentEvent {
  id: string;
  incident_id: string;
  event_type: OperationsIncidentEventType;
  actor_type: 'SYSTEM' | 'SUPER_ADMIN';
  actor_id: string;
  occurred_at: string;
  alert_id?: string | null;
  metadata: Record<string, unknown>;
}

export interface OperationsIncidentDetail {
  incident: OperationsIncident;
  active_alerts: OperationsAlert[];
  resolved_alerts: OperationsAlert[];
  timeline: OperationsIncidentEvent[];
}

export interface OperationsAlertsSummary {
  open_critical: number;
  open_high: number;
  open_warning: number;
  total_open: number;
  total_acknowledged: number;
}

export interface OperationsAlertsResult {
  alerts: OperationsAlert[];
  count: number;
  summary: OperationsAlertsSummary;
}

export interface OperationsIncidentsSummary {
  open_incidents: number;
  acknowledged_incidents: number;
  critical_incidents: number;
  high_incidents: number;
  warning_incidents: number;
  resolved_today: number;
}

export interface OperationsIncidentsResult {
  incidents: OperationsIncident[];
  count: number;
  summary: OperationsIncidentsSummary;
}

export interface OperationsAlertEvaluationResult {
  evaluated_at: string;
  duration_ms: number;
  rules_evaluated: number;
  rules_matched: number;
  alerts_created: number;
  alerts_updated: number;
  alerts_resolved: number;
  incidents_created: number;
  incidents_updated: number;
  incidents_resolved: number;
  errors: string[];
}

// ============================================================================
// Phase 6: Historical Operations Analytics & Forecasting Types
// ============================================================================

export type OperationsAnalyticsWindow = '1h' | '6h' | '24h' | '7d' | '30d' | '90d';
export type OperationsTrendDirection = 'RISING' | 'FALLING' | 'STABLE' | 'INSUFFICIENT_DATA';
export type OperationsThresholdStatus = 'APPROACHING' | 'NOT_APPROACHING' | 'ALREADY_EXCEEDED' | 'INSUFFICIENT_DATA';
export type OperationsDataQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export interface OperationsMetricHistoryPoint {
  timestamp: string;
  value: number;
  limit: number | null;
  status: string;
  unit: string;
}

export interface OperationsMetricAggregations {
  min: number;
  max: number;
  avg: number;
  count: number;
  first: number;
  latest: number;
  p95: number;
  change: number;
  changePercent: number;
  ratePerMinute: number;
}

export interface OperationsMetricTrendResult {
  direction: OperationsTrendDirection;
  slope: number;
  changePercent: number;
  sampleCount: number;
  baseline: number;
  currentValue: number;
  dataQuality: OperationsDataQuality;
  reason?: string;
}

export interface OperationsThresholdProjectionResult {
  metricKey: string;
  serviceId: string;
  currentValue: number;
  threshold: number;
  status: OperationsThresholdStatus;
  estimatedTimeToThresholdMs: number | null;
  projectedExceedAt: string | null;
  slopePerSecond: number;
  dataQuality: OperationsDataQuality;
  reason: string;
}

export interface OperationsMetricHistoryResult {
  metricKey: string;
  serviceId: string;
  window: string;
  unit: string;
  points: OperationsMetricHistoryPoint[];
  aggregations: OperationsMetricAggregations | null;
  trend: OperationsMetricTrendResult;
  dataQuality: OperationsDataQuality;
}

export interface OperationsIncidentAnalytics {
  window: string;
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  bySeverity: Record<string, number>;
  byService: Record<string, number>;
  automaticRecoveryCount: number;
  manualResolutionCount: number;
  acknowledgedCount: number;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  longestDurationMs: number | null;
  mttrMs: number | null;
  openIncidentAverageAgeMs: number | null;
  incidentFrequencyPerDay: number;
}

export interface OperationsAlertAnalytics {
  window: string;
  totalAlerts: number;
  openAlerts: number;
  resolvedAlerts: number;
  bySeverity: Record<string, number>;
  byService: Record<string, number>;
  topRecurringRules: { ruleId: string; title: string; count: number }[];
  alertFrequencyPerDay: number;
}

export interface OperationsJobAnalytics {
  window: string;
  totalExecutions: number;
  successfulExecutions: number;
  partialExecutions: number;
  failedExecutions: number;
  staleExecutionsCount: number;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
  successRate: number;
  failureRate: number;
  byJob: Record<string, { total: number; success: number; failed: number; avgDurationMs: number }>;
}

export interface OperationsCrossServiceAnalytics {
  window: string;
  incidentsLast24h: number;
  incidentsLast7d: number;
  criticalIncidentsLast30d: number;
  topRecurringAlertRule: { ruleId: string; title: string; count: number } | null;
  mostUnstableService: { serviceId: string; incidentCount: number; alertCount: number } | null;
  longestAverageRecoveryTimeMs: number | null;
  services: Record<string, {
    serviceId: string;
    incidentsCount: number;
    alertsCount: number;
    healthProbeSuccessRate: number | null;
  }>;
}

// ============================================================================
// Phase 8: Operational Notifications & Escalation Types
// ============================================================================

export type NotificationChannel = 'EMAIL';

export type NotificationEventType =
  | 'INCIDENT_CREATED'
  | 'INCIDENT_ESCALATED'
  | 'INCIDENT_RESOLVED'
  | 'INCIDENT_MANUALLY_RESOLVED';

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'REQUEST_ACCEPTED'
  | 'FAILED'
  | 'CANCELLED';

export interface OperationsNotificationRecipient {
  id: string;
  email: string;
  display_name: string;
  role_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  group_memberships?: {
    group_id: string;
    ops_notification_groups?: {
      group_key: string;
      name: string;
    };
  }[];
}

export interface OperationsNotificationGroup {
  id: string;
  group_key: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  members?: {
    recipient: OperationsNotificationRecipient;
  }[];
}

export interface OperationsNotificationPolicy {
  id: string;
  policy_key: string;
  name: string;
  description: string | null;
  event_type: NotificationEventType;
  min_severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO';
  group_id: string;
  channel: NotificationChannel;
  cooldown_minutes: number;
  repeat_interval_minutes: number | null;
  escalation_delay_minutes: number | null;
  escalation_group_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  group?: OperationsNotificationGroup;
  escalation_group?: OperationsNotificationGroup;
}

export interface OperationsNotificationOutboxItem {
  id: string;
  policy_id: string | null;
  incident_id: string | null;
  alert_id: string | null;
  group_id: string | null;
  recipient_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  channel: NotificationChannel;
  subject: string;
  content_text: string;
  content_html: string | null;
  status: NotificationDeliveryStatus;
  scheduled_at: string;
  attempt_count: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  safe_error_code: string | null;
  safe_error_message: string | null;
  idempotency_key: string;
  escalation_level: number;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  updated_at: string;
}

export interface OperationsNotificationDeliveryAttempt {
  id: string;
  notification_id: string;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  status: NotificationDeliveryStatus;
  provider_message_id: string | null;
  safe_error_code: string | null;
  safe_error_message: string | null;
  created_at: string;
}

export interface OperationsNotificationsOverview {
  summary: {
    pending: number;
    processing: number;
    request_accepted: number;
    failed: number;
    cancelled: number;
    total: number;
  };
  policy_count: number;
  recipient_count: number;
  group_count: number;
  provider: {
    channel: string;
    adapter: string;
    status: 'CONFIGURED' | 'NOT_CONFIGURED';
    is_configured: boolean;
    from_address: string;
  };
  recent_outbox: OperationsNotificationOutboxItem[];
  recent_attempts: OperationsNotificationDeliveryAttempt[];
}

export interface OperationsNotificationPreviewResult {
  preview_mode: boolean;
  sent: boolean;
  event_type: NotificationEventType;
  subject: string;
  content_text: string;
  content_html: string;
}

// ============================================================================
// Phase 9: Safe Operational Remediation & Runbooks Contracts
// ============================================================================

export type RemediationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RemediationExecutionMode =
  | 'OBSERVE_ONLY'
  | 'AUTOMATIC'
  | 'APPROVAL_REQUIRED';

export type RemediationExecutionStatus =
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'CANCELLED'
  | 'EXPIRED';

export type RemediationEnvironment =
  | 'DEVELOPMENT'
  | 'STAGING'
  | 'PRODUCTION'
  | 'UNKNOWN';

export interface OperationsRunbook {
  id: string;
  runbook_key: string;
  name: string;
  description: string;
  category: string;
  risk_level: RemediationRiskLevel;
  execution_mode: RemediationExecutionMode;
  enabled: boolean;
  version: number;
  preconditions: string[];
  postconditions: string[];
  preconditions_description?: string;
  postconditions_description?: string;
  rollback_supported: boolean;
  approval_required: boolean;
  supports_rollback?: boolean;
  requires_approval?: boolean;
  allowed_environments: RemediationEnvironment[];
  created_at: string;
  updated_at: string;
}

export interface OperationsRemediationAction {
  id: string;
  action_key: string;
  runbook_id: string;
  runbook_key: string;
  name: string;
  description: string;
  handler_key: string;
  risk_level: RemediationRiskLevel;
  supports_auto_execution: boolean;
  supports_rollback: boolean;
  rollback_action_key?: string | null;
  requires_approval: boolean;
  timeout_seconds: number;
  cooldown_seconds: number;
  max_attempts: number;
  allowed_environments: RemediationEnvironment[];
  parameters_schema: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperationsRemediationExecution {
  id: string;
  incident_id?: string | null;
  runbook_id: string;
  runbook_key: string;
  action_key: string;
  execution_mode: RemediationExecutionMode;
  risk_level: RemediationRiskLevel;
  status: RemediationExecutionStatus;
  requested_by: string;
  approved_by?: string | null;
  executed_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  attempt_count: number;
  max_attempts: number;
  environment: RemediationEnvironment;
  correlation_id: string;
  idempotency_key: string;
  parameters: Record<string, unknown>;
  precondition_verification?: Record<string, unknown> | null;
  postcondition_verification?: {
    verified: boolean;
    evidence?: Record<string, unknown>;
    timestamp: string;
  } | null;
  rollback_status: 'NOT_APPLICABLE' | 'PENDING' | 'ROLLED_BACK' | 'ROLLBACK_FAILED';
  safe_result?: Record<string, unknown> | null;
  safe_error_code?: string | null;
  safe_error_message?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OperationsRemediationDryRunResult {
  action_key: string;
  runbook_key: string;
  preconditions_passed: boolean;
  reasons: string[];
  predicted_impact: {
    what_will_happen: string[];
    what_will_not_happen: string[];
    estimated_duration_ms: number;
    target_environment: RemediationEnvironment;
  };
  rollback_available: boolean;
  requires_approval: boolean;
  risk_level: RemediationRiskLevel;
  dry_run: true;
}

// ============================================================================
// Phase 10: Operational Resilience & Disaster Recovery Contracts
// ============================================================================

export type ResilienceCategory =
  | 'TELEMETRY_FAILURE'
  | 'PROVIDER_FAILURE'
  | 'JOB_FAILURE'
  | 'ALERTING_FAILURE'
  | 'NOTIFICATION_FAILURE'
  | 'REMEDIATION_FAILURE'
  | 'DATABASE_DEGRADATION'
  | 'NETWORK_FAILURE'
  | 'RECOVERY_FAILURE'
  | 'COMBINED_FAILURE'
  | 'DISASTER_RECOVERY';

export type ResilienceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ResilienceTestStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED';

export interface OperationsResilienceScenario {
  id?: string;
  scenario_key: string;
  name: string;
  description: string;
  category: ResilienceCategory;
  risk_level: ResilienceRiskLevel;
  allowed_environments: RemediationEnvironment[];
  is_destructive: boolean;
  enabled: boolean;
  expected_detection: string;
  expected_recovery: string;
  timeout_ms: number;
  created_at?: string;
  updated_at?: string;
}

export interface OperationsResilienceTestRun {
  id: string;
  scenario_key: string;
  environment: RemediationEnvironment;
  status: ResilienceTestStatus;
  correlation_id: string;
  requested_by: string;
  executed_by?: string | null;
  is_simulation: boolean;
  detection_verified: boolean;
  recovery_verified: boolean;
  duration_ms?: number | null;
  evidence: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface OperationsResilienceOverview {
  total_scenarios: number;
  enabled_scenarios: number;
  runs_today: number;
  passed_today: number;
  failed_today: number;
  pass_rate: number;
}

export interface OperationsResilienceRunResult {
  success: boolean;
  run_id: string;
  scenario_key: string;
  status: ResilienceTestStatus;
  detection_verified: boolean;
  recovery_verified: boolean;
  duration_ms: number;
  environment: RemediationEnvironment;
  evidence: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
}

// ============================================================================
// Phase 11: SLO, Capacity & Production Readiness Governance Types
// ============================================================================

export type SliCalculationType =
  | 'AVAILABILITY'
  | 'ERROR_RATE'
  | 'SUCCESS_RATE'
  | 'LATENCY'
  | 'FRESHNESS'
  | 'DURATION'
  | 'RECOVERY_TIME';

export type SliUnit = 'PERCENT' | 'MILLISECONDS' | 'SECONDS' | 'COUNT' | 'RATIO';

export type SliAggregation = 'RATIO' | 'P95' | 'P99' | 'AVERAGE' | 'DELTA' | 'LATEST';

export interface OperationsSliDefinition {
  sli_key: string;
  name: string;
  service_id: string;
  metric_source: string;
  calculation_type: SliCalculationType;
  unit: SliUnit;
  aggregation: SliAggregation;
  description: string;
  is_enabled: boolean;
}

export type SloWindow = '24h' | '7d' | '30d' | '90d';
export type SloDirection = 'GREATER_EQUAL' | 'LESS_EQUAL';

export interface OperationsSloDefinition {
  id?: string;
  slo_key: string;
  name: string;
  service_id: string;
  sli_key: string;
  target: number;
  window: SloWindow;
  direction: SloDirection;
  warning_threshold?: number | null;
  enabled: boolean;
  description: string;
  version: number;
  effective_from: string;
  effective_to?: string | null;
}

export type SloStatus =
  | 'MEETING'
  | 'AT_RISK'
  | 'BREACHED'
  | 'INSUFFICIENT_DATA'
  | 'NOT_CONFIGURED';

export type ErrorBudgetStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'EXHAUSTED';

export interface OperationsErrorBudget {
  total_budget: number;
  consumed_budget: number;
  remaining_budget: number;
  consumption_percent: number;
  status: ErrorBudgetStatus;
  burn_rate: number | null;
}

export interface OperationsSloEvaluation {
  id?: string;
  slo_key: string;
  version: number;
  evaluated_at: string;
  window: SloWindow;
  window_start: string;
  window_end: string;
  sample_count: number;
  actual_value: number | null;
  target: number;
  status: SloStatus;
  error_budget: OperationsErrorBudget | null;
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE';
  details: Record<string, unknown>;
}

export type CapacityCategory = 'DATABASE' | 'STORAGE' | 'WORKER' | 'QUEUE' | 'EMAIL';
export type CapacityUnit = 'BYTES' | 'COUNT' | 'PERCENT' | 'MILLISECONDS';
export type CapacityState =
  | 'HEALTHY'
  | 'WATCH'
  | 'CRITICAL'
  | 'EXHAUSTED'
  | 'NOT_CONFIGURED'
  | 'NOT_AVAILABLE';

export interface OperationsCapacityResource {
  resource_key: string;
  name: string;
  category: CapacityCategory;
  unit: CapacityUnit;
  current_usage: number | null;
  hard_limit: number | null;
  headroom: number | null;
  utilization_percent: number | null;
  state: CapacityState;
  soft_threshold_percent: number;
  critical_threshold_percent: number;
  forecast_status?: 'APPROACHING' | 'NOT_APPROACHING' | 'ALREADY_EXCEEDED' | 'INSUFFICIENT_DATA';
  estimated_exhaustion_days?: number | null;
  data_quality: string;
  updated_at: string;
}

export type ReadinessStatus = 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY' | 'UNKNOWN';
export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';

export interface OperationsReadinessCheck {
  check_key: string;
  name: string;
  status: CheckStatus;
  blocking: boolean;
  observed_value: string;
  expected_condition: string;
  source: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface OperationsReadinessEvaluation {
  id?: string;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'UNKNOWN';
  overall_status: ReadinessStatus;
  evaluated_at: string;
  evaluated_by: string;
  correlation_id: string;
  checks: OperationsReadinessCheck[];
  blocking_count: number;
  warning_count: number;
  passed_count: number;
  evidence: Record<string, unknown>;
}

export interface OperationsGovernanceOverview {
  slo_summary: {
    total_slos: number;
    meeting: number;
    at_risk: number;
    breached: number;
    insufficient_data: number;
    compliance_rate: number;
    error_budgets_exhausted: number;
  };
  capacity_summary: {
    total_resources: number;
    healthy: number;
    watch: number;
    critical: number;
    exhausted: number;
  };
  readiness_summary: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'UNKNOWN';
    overall_status: ReadinessStatus;
    blocking_count: number;
    warning_count: number;
    last_evaluated: string | null;
  };
}


