import type { AnyRule, Environment, ResourceType } from '../models/types.js';

export function ruleAppliesToEnvironment(
  rule: Pick<AnyRule, 'environmentIds'>,
  environment: Environment | null
): boolean {
  if (!rule.environmentIds?.length) return true;
  return Boolean(environment && rule.environmentIds.includes(environment.id));
}

export function resolveRuleVariables(text: string, environment: Environment | null): string {
  if (!environment || !text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const variable = environment.variables.find((candidate) => candidate.key === key);
    return variable ? variable.value : match;
  });
}

export function absoluteRequestUrl(url: string, baseUrl?: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

export function matchesUrlPattern(
  pattern: string,
  isRegex: boolean,
  url: string
): boolean {
  if (!pattern || pattern === '*') return true;
  try {
    if (isRegex) return new RegExp(pattern).test(url);
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(url);
  } catch {
    return false;
  }
}

function resourceTypeMatches(
  configured: ResourceType[],
  actual: string
): boolean {
  if (!configured.length || configured.includes('*')) return true;
  if (configured.includes(actual as ResourceType)) return true;
  if (configured.includes('document') && (actual === 'main_frame' || actual === 'sub_frame')) {
    return true;
  }
  return false;
}

export function ruleMatchesRequest(
  rule: AnyRule,
  request: { url: string; method: string; resourceType?: string },
  environment: Environment | null
): boolean {
  if (!ruleAppliesToEnvironment(rule, environment)) return false;
  const matcher = rule.urlMatcher;
  const pattern = resolveRuleVariables(matcher.pattern, environment);
  if (!matchesUrlPattern(pattern, matcher.isRegex, request.url)) return false;
  if (
    matcher.httpMethods.length &&
    !matcher.httpMethods.includes('*') &&
    !matcher.httpMethods.includes(request.method.toUpperCase() as typeof matcher.httpMethods[number])
  ) {
    return false;
  }
  return request.resourceType
    ? resourceTypeMatches(matcher.resourceTypes, request.resourceType)
    : true;
}

const SENSITIVE_QUERY_KEYS = /^(?:access_?token|auth|authorization|api_?key|key|password|passwd|secret|session|signature|sig|token)$/i;

export function redactSensitiveUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    return parsed.href;
  } catch {
    return url;
  }
}
