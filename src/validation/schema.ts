import type {
  AnyRule,
  Environment,
  ExportSchema,
  HeaderOperation,
  RuleType,
} from '../models/types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const APPENDABLE_REQUEST_HEADERS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'access-control-request-headers',
  'cache-control', 'connection', 'content-language', 'cookie', 'forwarded',
  'if-match', 'if-none-match', 'keep-alive', 'range', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'user-agent', 'via', 'want-digest',
  'x-forwarded-for',
]);

const RULE_TYPES = new Set<RuleType>([
  'header', 'redirect', 'queryParam', 'mock', 'responseOverride', 'cookie',
]);
const HTTP_METHODS = new Set(['*', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
const RESOURCE_TYPES = new Set([
  '*', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'document',
  'font', 'media', 'websocket', 'other',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateOperations(
  operations: unknown,
  label: string,
  allowed: Set<string>,
  requireValue: boolean
): string[] {
  if (!Array.isArray(operations) || operations.length === 0) {
    return [`${label} must contain at least one operation.`];
  }

  const errors: string[] = [];
  operations.forEach((operation, index) => {
    if (!isRecord(operation)) {
      errors.push(`${label} operation ${index + 1} is invalid.`);
      return;
    }
    const key = 'key' in operation ? operation.key : operation.name;
    if (!isNonEmptyString(key)) {
      errors.push(`${label} operation ${index + 1} requires a name/key.`);
    }
    if (!isNonEmptyString(operation.operation) || !allowed.has(operation.operation)) {
      errors.push(`${label} operation ${index + 1} has an unsupported action.`);
    }
    if (requireValue && operation.operation !== 'remove' && typeof operation.value !== 'string') {
      errors.push(`${label} operation ${index + 1} requires a value.`);
    }
  });
  return errors;
}

export function validateHeaderOperations(
  operations: HeaderOperation[],
  target: 'request' | 'response'
): string[] {
  const errors = validateOperations(
    operations,
    'Header',
    new Set(['set', 'append', 'remove']),
    true
  );
  operations.forEach((operation, index) => {
    if (
      target === 'request' &&
      operation.operation === 'append' &&
      typeof operation.name === 'string' &&
      !operation.name.includes('{{') &&
      !APPENDABLE_REQUEST_HEADERS.has(operation.name.toLowerCase())
    ) {
      errors.push(
        `Header operation ${index + 1}: Chrome cannot append "${operation.name}". Use Set instead.`
      );
    }
  });
  return errors;
}

export function validateRule(rule: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(rule)) return { valid: false, errors: ['Rule must be an object.'] };

  if (!isNonEmptyString(rule.id)) errors.push('Rule ID is required.');
  else if (!/^[A-Za-z0-9_-]{1,128}$/.test(rule.id)) errors.push('Rule ID contains unsupported characters.');
  if (!isNonEmptyString(rule.name)) errors.push('Rule name is required.');
  if (!isNonEmptyString(rule.type) || !RULE_TYPES.has(rule.type as RuleType)) {
    errors.push('Rule type is unsupported.');
  }
  if (typeof rule.enabled !== 'boolean') errors.push('Rule enabled state must be boolean.');
  if (rule.group !== undefined && typeof rule.group !== 'string') errors.push('Rule group must be text.');
  if (
    rule.tags !== undefined &&
    (!Array.isArray(rule.tags) || rule.tags.some((tag) => typeof tag !== 'string' || !tag.trim()))
  ) {
    errors.push('Rule tags must be non-empty text values.');
  }
  if (
    rule.environmentIds !== undefined &&
    (!Array.isArray(rule.environmentIds) ||
      rule.environmentIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)))
  ) {
    errors.push('Rule environment restrictions contain an invalid environment ID.');
  }
  if (!Number.isInteger(rule.priority) || Number(rule.priority) < 1 || Number(rule.priority) > 999) {
    errors.push('Priority must be an integer from 1 to 999.');
  }

  const matcher = rule.urlMatcher;
  if (!isRecord(matcher) || !isNonEmptyString(matcher.pattern)) {
    errors.push('A URL match pattern is required.');
  } else {
    if (matcher.isRegex === true) {
      try {
        new RegExp(matcher.pattern);
      } catch {
        errors.push('The URL regular expression is invalid.');
      }
    }
    if (!Array.isArray(matcher.httpMethods) || matcher.httpMethods.length === 0) {
      errors.push('At least one HTTP method is required.');
    } else if (matcher.httpMethods.some((method) => typeof method !== 'string' || !HTTP_METHODS.has(method))) {
      errors.push('One or more HTTP methods are unsupported.');
    }
    if (!Array.isArray(matcher.resourceTypes) || matcher.resourceTypes.length === 0) {
      errors.push('At least one resource type is required.');
    } else if (matcher.resourceTypes.some((resource) => typeof resource !== 'string' || !RESOURCE_TYPES.has(resource))) {
      errors.push('One or more resource types are unsupported.');
    }
  }

  switch (rule.type) {
    case 'header':
      if (rule.target !== 'request' && rule.target !== 'response') {
        errors.push('Header target must be request or response.');
      } else {
        errors.push(...validateHeaderOperations(
          (Array.isArray(rule.headers) ? rule.headers : []) as HeaderOperation[],
          rule.target
        ));
      }
      if (Array.isArray(rule.headers)) {
        rule.headers.forEach((header, index) => {
          if (
            isRecord(header) &&
            typeof header.name === 'string' &&
            !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(header.name.replace(/\{\{\w+\}\}/g, 'X'))
          ) {
            errors.push(`Header operation ${index + 1} has an invalid HTTP header name.`);
          }
          if (isRecord(header) && typeof header.value === 'string' && /[\r\n]/.test(header.value)) {
            errors.push(`Header operation ${index + 1} value cannot contain a line break.`);
          }
        });
      }
      break;
    case 'redirect':
      if (!isNonEmptyString(rule.redirectUrl)) errors.push('Redirect destination is required.');
      if (
        typeof rule.redirectUrl === 'string' &&
        /(?:\\|\$)\d/.test(rule.redirectUrl) &&
        (!isRecord(matcher) || matcher.isRegex !== true)
      ) {
        errors.push('Redirect capture groups require a regular-expression URL matcher.');
      }
      if (
        typeof rule.redirectUrl === 'string' &&
        !/(?:\\|\$)\d/.test(rule.redirectUrl) &&
        !rule.redirectUrl.includes('{{')
      ) {
        try {
          const destination = new URL(rule.redirectUrl);
          if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
            errors.push('Redirect destination must use HTTP or HTTPS.');
          }
        } catch {
          errors.push('Redirect destination must be a valid absolute URL.');
        }
      }
      break;
    case 'queryParam':
      errors.push(...validateOperations(
        rule.params,
        'Query parameter',
        new Set(['set', 'remove']),
        true
      ));
      if (
        Array.isArray(rule.params) &&
        rule.params.some((parameter) => isRecord(parameter) && parameter.operation === 'append')
      ) {
        errors.push('Duplicate query-parameter append is not supported by Chromium DNR; use Set.');
      }
      break;
    case 'mock':
      if (
        isRecord(matcher) &&
        Array.isArray(matcher.resourceTypes) &&
        !matcher.resourceTypes.includes('*') &&
        !matcher.resourceTypes.includes('xmlhttprequest')
      ) {
        errors.push('Mock rules must target Fetch / XHR resources.');
      }
      if (!Number.isInteger(rule.statusCode) || Number(rule.statusCode) < 200 || Number(rule.statusCode) > 599) {
        errors.push('Mock status code must be from 200 to 599.');
      }
      if (!Number.isFinite(rule.delay) || Number(rule.delay) < 0) {
        errors.push('Mock delay must be zero or greater.');
      }
      if (typeof rule.responseBody !== 'string') errors.push('Mock response body must be text.');
      if (!Array.isArray(rule.responseHeaders)) {
        errors.push('Mock response headers must be an array.');
      } else if (rule.responseHeaders.length) {
        errors.push(...validateOperations(
          rule.responseHeaders,
          'Mock response header',
          new Set(['set', 'append', 'remove']),
          true
        ));
      }
      break;
    case 'responseOverride':
      if (
        isRecord(matcher) &&
        Array.isArray(matcher.resourceTypes) &&
        !matcher.resourceTypes.includes('*') &&
        !matcher.resourceTypes.includes('xmlhttprequest')
      ) {
        errors.push('Response overrides must target Fetch / XHR resources.');
      }
      if (typeof rule.body !== 'string') errors.push('Override body must be text.');
      if (
        rule.statusCode !== undefined &&
        (!Number.isInteger(rule.statusCode) || Number(rule.statusCode) < 100 || Number(rule.statusCode) > 599)
      ) {
        errors.push('Override status code must be from 100 to 599.');
      }
      break;
    case 'cookie':
      errors.push(...validateOperations(
        rule.cookies,
        'Cookie',
        new Set(['set', 'remove']),
        true
      ));
      if (
        Array.isArray(rule.cookies) &&
        rule.cookies.length > 1 &&
        rule.cookies.some((cookie) => isRecord(cookie) && cookie.operation === 'remove')
      ) {
        errors.push('A cookie Remove operation must be the only operation because it removes the entire Cookie header.');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

function validateEnvironment(environment: unknown, index: number): string[] {
  if (!isRecord(environment)) return [`Environment ${index + 1} must be an object.`];
  const errors: string[] = [];
  if (!isNonEmptyString(environment.id)) errors.push(`Environment ${index + 1} requires an ID.`);
  else if (!/^[A-Za-z0-9_-]{1,128}$/.test(environment.id)) {
    errors.push(`Environment ${index + 1} ID contains unsupported characters.`);
  }
  if (!isNonEmptyString(environment.name)) errors.push(`Environment ${index + 1} requires a name.`);
  if (!Array.isArray(environment.variables)) {
    errors.push(`Environment ${index + 1} variables must be an array.`);
  } else {
    const keys = new Set<string>();
    environment.variables.forEach((variable, variableIndex) => {
      if (
        !isRecord(variable) ||
        !isNonEmptyString(variable.key) ||
        typeof variable.value !== 'string'
      ) {
        errors.push(`Environment ${index + 1}, variable ${variableIndex + 1} is invalid.`);
      } else if (!/^\w+$/.test(variable.key)) {
        errors.push(`Environment ${index + 1}, variable ${variableIndex + 1} key can only contain letters, numbers and underscores.`);
      } else if (keys.has(variable.key)) {
        errors.push(`Environment ${index + 1} contains duplicate variable key "${variable.key}".`);
      } else {
        keys.add(variable.key);
      }
      if (isRecord(variable) && variable.isSecret !== undefined && typeof variable.isSecret !== 'boolean') {
        errors.push(`Environment ${index + 1}, variable ${variableIndex + 1} secret flag is invalid.`);
      }
    });
  }
  return errors;
}

export function validateExportSchema(value: unknown): ValidationResult {
  if (!isRecord(value)) return { valid: false, errors: ['Import must contain a JSON object.'] };
  const errors: string[] = [];
  if (!isNonEmptyString(value.version)) errors.push('Export version is missing.');
  if (!isNonEmptyString(value.exportedAt) || Number.isNaN(Date.parse(value.exportedAt))) {
    errors.push('Export timestamp is missing or invalid.');
  }
  if (!Array.isArray(value.rules)) {
    errors.push('Rules must be an array.');
  } else {
    const ruleIds = new Set<string>();
    value.rules.forEach((rule, index) => {
      const result = validateRule(rule);
      result.errors.forEach((error) => errors.push(`Rule ${index + 1}: ${error}`));
      if (isRecord(rule) && typeof rule.id === 'string') {
        if (ruleIds.has(rule.id)) errors.push(`Duplicate rule ID "${rule.id}".`);
        ruleIds.add(rule.id);
      }
    });
    const dnrCount = value.rules.filter((rule) =>
      isRecord(rule) && rule.type !== 'mock' && rule.type !== 'responseOverride'
    ).length;
    if (dnrCount > 5000) errors.push('Imports can contain at most 5,000 browser-network rules.');
  }
  if (!Array.isArray(value.environments)) {
    errors.push('Environments must be an array.');
  } else {
    const environmentIds = new Set<string>();
    value.environments.forEach((environment, index) => {
      errors.push(...validateEnvironment(environment, index));
      if (isRecord(environment) && typeof environment.id === 'string') {
        if (environmentIds.has(environment.id)) errors.push(`Duplicate environment ID "${environment.id}".`);
        environmentIds.add(environment.id);
      }
    });
    const activeCount = (value.environments as Environment[]).filter((environment) => environment.isActive).length;
    if (activeCount > 1) errors.push('Only one imported environment can be active.');
    if (Array.isArray(value.rules)) {
      value.rules.forEach((rule, ruleIndex) => {
        if (!isRecord(rule) || !Array.isArray(rule.environmentIds)) return;
        rule.environmentIds.forEach((environmentId) => {
          if (typeof environmentId === 'string' && !environmentIds.has(environmentId)) {
            errors.push(
              `Rule ${ruleIndex + 1} references missing environment ID "${environmentId}".`
            );
          }
        });
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function asExportSchema(value: unknown): ExportSchema {
  const result = validateExportSchema(value);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return value as ExportSchema;
}

export function normalizeRuleForDnr(rule: AnyRule): AnyRule {
  if (rule.type !== 'header') return rule;
  return {
    ...rule,
    headers: rule.headers.map((header) => ({
      ...header,
      name: header.name.trim(),
    })),
  };
}
