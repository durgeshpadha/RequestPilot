// ============================================================
// Core Enums
// ============================================================

export type ResourceType =
  | 'xmlhttprequest'
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'document'
  | 'font'
  | 'media'
  | 'websocket'
  | 'other'
  | '*';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | '*';

export type RuleType = 'header' | 'redirect' | 'queryParam' | 'mock' | 'responseOverride' | 'cookie';

export type HeaderOperation = {
  name: string;
  value: string;
  operation: 'set' | 'append' | 'remove';
};

export type QueryParamOperation = {
  key: string;
  value: string;
  operation: 'set' | 'append' | 'remove';
};

export type CookieOperation = {
  name: string;
  value: string;
  operation: 'set' | 'remove';
};

// ============================================================
// URL Matcher
// ============================================================

export interface UrlMatcher {
  pattern: string;
  isRegex: boolean;
  resourceTypes: ResourceType[];
  httpMethods: HttpMethod[];
}

// ============================================================
// Base Rule
// ============================================================

export interface BaseRule {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  group?: string;
  tags?: string[];
  /** Empty/undefined means every environment. */
  environmentIds?: string[];
  priority: number;
  usageCount?: number;
}

// ============================================================
// Rule Variants
// ============================================================

export interface HeaderRule extends BaseRule {
  type: 'header';
  urlMatcher: UrlMatcher;
  headers: HeaderOperation[];
  target: 'request' | 'response';
}

export interface RedirectRule extends BaseRule {
  type: 'redirect';
  urlMatcher: UrlMatcher;
  redirectUrl: string;
}

export interface QueryParamRule extends BaseRule {
  type: 'queryParam';
  urlMatcher: UrlMatcher;
  params: QueryParamOperation[];
}

export interface MockApiRule extends BaseRule {
  type: 'mock';
  urlMatcher: UrlMatcher;
  statusCode: number;
  responseBody: string;
  responseHeaders: HeaderOperation[];
  delay: number;
}

export interface ResponseOverrideRule extends BaseRule {
  type: 'responseOverride';
  urlMatcher: UrlMatcher;
  body: string;
  statusCode?: number;
}

export interface CookieRule extends BaseRule {
  type: 'cookie';
  urlMatcher: UrlMatcher;
  cookies: CookieOperation[];
}

export type AnyRule =
  | HeaderRule
  | RedirectRule
  | QueryParamRule
  | MockApiRule
  | ResponseOverrideRule
  | CookieRule;

// ============================================================
// Environment
// ============================================================

export interface EnvironmentVariable {
  key: string;
  value: string;
  description?: string;
  isSecret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  isActive: boolean;
}

// ============================================================
// Settings
// ============================================================

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  theme: Theme;
  defaultEnvironmentId: string | null;
  autoBackup: boolean;
  extensionEnabled: boolean;
  historyEnabled: boolean;
  redactSensitiveData: boolean;
  historyLimit: number;
}

// ============================================================
// History
// ============================================================

export interface HistoryEntry {
  id: string;
  timestamp: string;
  ruleName: string;
  ruleId: string;
  ruleType: RuleType;
  method: string;
  url: string;
  modificationType: string;
  status: 'applied' | 'error';
  errorMessage?: string;
}

// ============================================================
// Import / Export Schema
// ============================================================

export interface ExportSchema {
  version: string;
  exportedAt: string;
  rules: AnyRule[];
  environments: Environment[];
}

// ============================================================
// Storage Keys
// ============================================================

export const STORAGE_KEYS = {
  RULES: 'requestpilot_rules',
  ENVIRONMENTS: 'requestpilot_environments',
  SETTINGS: 'requestpilot_settings',
  HISTORY: 'requestpilot_history',
  USAGE: 'requestpilot_usage',
  AUTO_BACKUP: 'requestpilot_autobackup',
  INITIALIZED: 'requestpilot_initialized',
  SCHEMA_VERSION: 'requestpilot_schema_version',
} as const;
