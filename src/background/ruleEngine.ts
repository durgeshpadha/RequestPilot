/**
 * RuleEngine — converts RequestPilot rules into
 * chrome.declarativeNetRequest dynamic rules and manages
 * their lifecycle. Called whenever rules or settings change.
 *
 * Supported via declarativeNetRequest:
 *   - HeaderRule   (request & response headers)
 *   - RedirectRule (URL redirect)
 *   - QueryParamRule (query string manipulation via transform)
 *   - CookieRule   (Cookie request header / Set-Cookie response header)
 *
 * NOT supported by declarativeNetRequest (handled by content script):
 *   - MockApiRule         → fetch/XHR intercept in content.ts
 *   - ResponseOverrideRule → fetch/XHR intercept in content.ts
 */

import type {
  AnyRule,
  HeaderRule,
  RedirectRule,
  QueryParamRule,
  CookieRule,
  Environment,
  ResourceType,
  HttpMethod,
} from '../models/types.js';
import { validateRule } from '../validation/schema.js';
import { ruleAppliesToEnvironment } from '../utils/ruleMatcher.js';

// ============================================================
// Constants
// ============================================================

const DNR_ID_BASE = 1000;
const MAX_DNR_ID = 2_147_483_647;

// ============================================================
// Helpers
// ============================================================

/**
 * Resolve {{VAR}} placeholders using the active environment.
 */
function resolve(text: string, env: Environment | null): string {
  if (!env || !text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = env.variables.find((x) => x.key === key);
    return v ? v.value : `{{${key}}}`;
  });
}

/**
 * Convert our ResourceType array to the DNR ResourceType array.
 * '*' expands to all known resource types.
 */
function toDnrResourceTypes(
  types: ResourceType[]
): chrome.declarativeNetRequest.ResourceType[] {
  const all = [
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
    'font', 'object', 'xmlhttprequest', 'ping', 'csp_report',
    'media', 'websocket', 'other',
  ] as chrome.declarativeNetRequest.ResourceType[];
  if (types.includes('*') || types.length === 0) return all;
  return types
    .filter((t) => t !== '*')
    .flatMap((t) => {
      if (t === 'document') {
        return ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[];
      }
      return [t as chrome.declarativeNetRequest.ResourceType];
    });
}

/**
 * Convert our pattern (glob or regex) to a DNR UrlFilter / regexFilter.
 * Returns an object to spread into the DNR condition.
 */
function toUrlFilter(
  pattern: string,
  isRegex: boolean
): { urlFilter?: string; regexFilter?: string } {
  if (!pattern || pattern === '*') return {};
  if (isRegex) return { regexFilter: pattern };

  // The UI exposes glob semantics, so anchor both ends to keep browser DNR
  // matching consistent with the editor test tool and mock interceptor.
  return { urlFilter: `|${pattern}|` };
}

/**
 * Convert our HttpMethod list to DNR request methods.
 * '*' means no restriction (omit the field).
 */
function toRequestMethods(
  methods: HttpMethod[]
): chrome.declarativeNetRequest.RequestMethod[] | undefined {
  if (methods.includes('*') || methods.length === 0) return undefined;
  return methods
    .filter((m) => m !== '*')
    .map((m) => m.toLowerCase() as chrome.declarativeNetRequest.RequestMethod);
}

/**
 * Stable numeric ID for a rule string ID.
 * Hashes the string into a positive integer in [DNR_ID_BASE, MAX_DYNAMIC_RULES).
 */
function hashedId(ruleId: string): number {
  let hash = 0;
  for (let i = 0; i < ruleId.length; i++) {
    hash = (Math.imul(31, hash) + ruleId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % (MAX_DNR_ID - DNR_ID_BASE)) + DNR_ID_BASE;
}

function resolveRuleValue<T>(value: T, env: Environment | null): T {
  if (typeof value === 'string') return resolve(value, env) as T;
  if (Array.isArray(value)) return value.map((item) => resolveRuleValue(item, env)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRuleValue(item, env)])
    ) as T;
  }
  return value;
}

function allocateDnrId(ruleId: string, used: Set<number>): number {
  let candidate = hashedId(ruleId);
  while (used.has(candidate)) {
    candidate = candidate >= MAX_DNR_ID ? DNR_ID_BASE : candidate + 1;
  }
  used.add(candidate);
  return candidate;
}

// ============================================================
// Converters — one per rule type
// ============================================================

function headerRuleToDnr(
  rule: HeaderRule,
  env: Environment | null,
  id: number
): chrome.declarativeNetRequest.Rule[] {
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const responseHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];

  for (const op of rule.headers) {
    const value = resolve(op.value, env);
    const headerName = resolve(op.name, env);
    const entry: chrome.declarativeNetRequest.ModifyHeaderInfo = {
      header: op.operation === 'append' ? headerName.toLowerCase() : headerName,
      operation: op.operation as chrome.declarativeNetRequest.HeaderOperation,
      ...(op.operation !== 'remove' ? { value } : {}),
    };
    if (rule.target === 'request') {
      requestHeaders.push(entry);
    } else {
      responseHeaders.push(entry);
    }
  }

  if (requestHeaders.length === 0 && responseHeaders.length === 0) return [];

  const condition: chrome.declarativeNetRequest.RuleCondition = {
    ...toUrlFilter(resolve(rule.urlMatcher.pattern, env), rule.urlMatcher.isRegex),
    resourceTypes: toDnrResourceTypes(rule.urlMatcher.resourceTypes),
    ...(toRequestMethods(rule.urlMatcher.httpMethods)
      ? { requestMethods: toRequestMethods(rule.urlMatcher.httpMethods) }
      : {}),
  };

  const action: chrome.declarativeNetRequest.RuleAction = {
    type: 'modifyHeaders',
    ...(requestHeaders.length ? { requestHeaders } : {}),
    ...(responseHeaders.length ? { responseHeaders } : {}),
  };

  return [{
    id,
    priority: rule.priority,
    condition,
    action,
  }];
}

function redirectRuleToDnr(
  rule: RedirectRule,
  env: Environment | null,
  id: number
): chrome.declarativeNetRequest.Rule[] {
  const redirectUrl = resolve(rule.redirectUrl, env);
  if (!redirectUrl) return [];

  const condition: chrome.declarativeNetRequest.RuleCondition = {
    ...toUrlFilter(resolve(rule.urlMatcher.pattern, env), rule.urlMatcher.isRegex),
    resourceTypes: toDnrResourceTypes(rule.urlMatcher.resourceTypes),
    ...(toRequestMethods(rule.urlMatcher.httpMethods)
      ? { requestMethods: toRequestMethods(rule.urlMatcher.httpMethods) }
      : {}),
  };

  // If the redirect URL contains a wildcard or regex group reference,
  // use regexSubstitution; otherwise use a plain redirect.
  const hasBackref = /(?:\\|\$)\d/.test(redirectUrl);
  const regexSubstitution = redirectUrl.replace(/\$(\d)/g, '\\$1');
  const action: chrome.declarativeNetRequest.RuleAction = hasBackref
    ? { type: 'redirect', redirect: { regexSubstitution } }
    : { type: 'redirect', redirect: { url: redirectUrl } };

  return [{
    id,
    priority: rule.priority,
    condition,
    action,
  }];
}

function queryParamRuleToDnr(
  rule: QueryParamRule,
  env: Environment | null,
  id: number
): chrome.declarativeNetRequest.Rule[] {
  // Build the queryTransform object
  const addOrReplaceParams: chrome.declarativeNetRequest.QueryKeyValue[] = [];
  const removeParams: string[] = [];

  for (const op of rule.params) {
    const key = resolve(op.key, env);
    const value = resolve(op.value, env);
    if (!key) continue;
    if (op.operation === 'remove') {
      removeParams.push(key);
    } else {
      // 'set' and 'append' both map to addOrReplaceParams in DNR
      addOrReplaceParams.push({ key, value });
    }
  }

  if (addOrReplaceParams.length === 0 && removeParams.length === 0) return [];

  const condition: chrome.declarativeNetRequest.RuleCondition = {
    ...toUrlFilter(resolve(rule.urlMatcher.pattern, env), rule.urlMatcher.isRegex),
    resourceTypes: toDnrResourceTypes(rule.urlMatcher.resourceTypes),
    ...(toRequestMethods(rule.urlMatcher.httpMethods)
      ? { requestMethods: toRequestMethods(rule.urlMatcher.httpMethods) }
      : {}),
  };

  const action: chrome.declarativeNetRequest.RuleAction = {
    type: 'redirect',
    redirect: {
      transform: {
        queryTransform: {
          ...(addOrReplaceParams.length ? { addOrReplaceParams } : {}),
          ...(removeParams.length ? { removeParams } : {}),
        },
      },
    },
  };

  return [{
    id,
    priority: rule.priority,
    condition,
    action,
  }];
}

function cookieRuleToDnr(
  rule: CookieRule,
  env: Environment | null,
  id: number
): chrome.declarativeNetRequest.Rule[] {
  // Cookie rules map to modifyHeaders on the Cookie (request) header.
  // Each set/remove operation is a separate header modification entry.
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];

  for (const op of rule.cookies) {
    const name = resolve(op.name, env);
    const value = resolve(op.value, env);
    if (!name) continue;

    if (op.operation === 'set') {
      // Append to Cookie header: "name=value"
      requestHeaders.push({
        header: 'cookie',
        operation: 'append',
        value: `${name}=${value}`,
      });
    } else if (op.operation === 'remove') {
      // We can't surgically remove a single cookie from the Cookie header
      // via DNR — we remove the entire Cookie header and rely on the user
      // knowing what they're doing, or use a content script approach.
      // Best effort: append an empty override so it's documented.
      // Real removal requires content script interception.
      requestHeaders.push({
        header: 'cookie',
        operation: 'remove',
      });
    }
  }

  if (requestHeaders.length === 0) return [];

  const condition: chrome.declarativeNetRequest.RuleCondition = {
    ...toUrlFilter(resolve(rule.urlMatcher.pattern, env), rule.urlMatcher.isRegex),
    resourceTypes: toDnrResourceTypes(rule.urlMatcher.resourceTypes),
    ...(toRequestMethods(rule.urlMatcher.httpMethods)
      ? { requestMethods: toRequestMethods(rule.urlMatcher.httpMethods) }
      : {}),
  };

  return [{
    id,
    priority: rule.priority,
    condition,
    action: { type: 'modifyHeaders', requestHeaders },
  }];
}

// ============================================================
// Public API
// ============================================================

/**
 * Convert all enabled RequestPilot rules into DNR rules.
 * MockApiRule and ResponseOverrideRule are excluded — handled by content script.
 */
export function buildDnrRules(
  rules: AnyRule[],
  env: Environment | null
): chrome.declarativeNetRequest.Rule[] {
  const dnrRules: chrome.declarativeNetRequest.Rule[] = [];
  const usedIds = new Set<number>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!ruleAppliesToEnvironment(rule, env)) continue;
    if (!validateRule(rule).valid) continue;
    const id = allocateDnrId(rule.id, usedIds);

    switch (rule.type) {
      case 'header':
        dnrRules.push(...headerRuleToDnr(rule, env, id));
        break;
      case 'redirect':
        dnrRules.push(...redirectRuleToDnr(rule, env, id));
        break;
      case 'queryParam':
        dnrRules.push(...queryParamRuleToDnr(rule, env, id));
        break;
      case 'cookie':
        dnrRules.push(...cookieRuleToDnr(rule, env, id));
        break;
      // mock and responseOverride handled by content script
    }
  }

  return dnrRules;
}

/**
 * Apply the current rule set to chrome.declarativeNetRequest.
 * Removes all existing dynamic rules first, then adds the new set.
 */
export async function applyDnrRules(
  rules: AnyRule[],
  env: Environment | null,
  extensionEnabled: boolean
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Remove all existing dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map((r) => r.id);

    if (!extensionEnabled) {
      // Extension is paused — just clear all rules
      if (removeIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
      }
      return { applied: 0, errors: [] };
    }

    const validRules: AnyRule[] = [];
    for (const rule of rules) {
      if (!rule.enabled || rule.type === 'mock' || rule.type === 'responseOverride') {
        if (ruleAppliesToEnvironment(rule, env)) validRules.push(rule);
        continue;
      }
      if (!ruleAppliesToEnvironment(rule, env)) continue;
      const validation = validateRule(rule);
      if (!validation.valid) {
        errors.push(`${rule.name}: ${validation.errors.join(' ')}`);
        continue;
      }
      const resolvedRule = resolveRuleValue(rule, env);
      if (/\{\{\w+\}\}/.test(JSON.stringify(resolvedRule))) {
        errors.push(`${rule.name}: one or more environment variables are unresolved.`);
        continue;
      }
      const resolvedValidation = validateRule(resolvedRule);
      if (!resolvedValidation.valid) {
        errors.push(`${rule.name}: ${resolvedValidation.errors.join(' ')}`);
        continue;
      }
      if (resolvedRule.urlMatcher.isRegex && chrome.declarativeNetRequest.isRegexSupported) {
        const supported = await chrome.declarativeNetRequest.isRegexSupported({
          regex: resolvedRule.urlMatcher.pattern,
        });
        if (!supported.isSupported) {
          errors.push(`${rule.name}: unsupported regular expression (${supported.reason ?? 'unknown reason'}).`);
          continue;
        }
      }
      validRules.push(resolvedRule);
    }

    const contentRules = validRules.filter((rule) =>
      rule.type === 'mock' || rule.type === 'responseOverride'
    );
    const networkRules = validRules
      .filter((rule) => rule.type !== 'mock' && rule.type !== 'responseOverride')
      .sort((a, b) => b.priority - a.priority);
    if (networkRules.length > 5000) {
      errors.push('Only the 5,000 highest-priority browser-network rules were activated.');
    }
    const dnrRules = buildDnrRules([...networkRules.slice(0, 5000), ...contentRules], env);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: dnrRules,
    });

    console.log(`[RequestPilot] Applied ${dnrRules.length} DNR rules`);
    return { applied: dnrRules.length, errors };
  } catch (err) {
    const msg = String(err);
    errors.push(msg);
    console.error('[RequestPilot] DNR apply error:', msg);
    return { applied: 0, errors };
  }
}
