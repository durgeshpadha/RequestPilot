(() => {
  interface BridgeRule {
    id: string;
    type: 'mock' | 'responseOverride';
    enabled: boolean;
    priority: number;
    environmentIds?: string[];
    urlMatcher: {
      pattern: string;
      isRegex: boolean;
      resourceTypes: string[];
      httpMethods: string[];
    };
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Array<{ name: string; value: string; operation: string }>;
    delay?: number;
    body?: string;
  }

  interface MainRulePayload {
    id: string;
    type: 'mock' | 'responseOverride';
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Array<{ name: string; value: string; operation: string }>;
    delay?: number;
    body?: string;
  }

  interface StoredEnvironment {
    id: string;
    isActive: boolean;
    variables: Array<{ key: string; value: string }>;
  }

  function createMessageId(): string {
    const random = new Uint32Array(4);
    crypto.getRandomValues(random);
    return Array.from(random, (part) => part.toString(16).padStart(8, '0')).join('');
  }

  const channel = createMessageId();
  let readyId = '';
  let extensionEnabled = false;
  let rules: BridgeRule[] = [];

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isBridgeRule(value: unknown): value is BridgeRule {
    if (!isRecord(value) || !isRecord(value.urlMatcher)) return false;
    const matcherValid =
      typeof value.id === 'string' &&
      (value.type === 'mock' || value.type === 'responseOverride') &&
      value.enabled === true &&
      typeof value.priority === 'number' && Number.isFinite(value.priority) &&
      typeof value.urlMatcher.pattern === 'string' && value.urlMatcher.pattern.length > 0 &&
      typeof value.urlMatcher.isRegex === 'boolean' &&
      Array.isArray(value.urlMatcher.resourceTypes) && value.urlMatcher.resourceTypes.length > 0 &&
      value.urlMatcher.resourceTypes.every((resource) => typeof resource === 'string') &&
      Array.isArray(value.urlMatcher.httpMethods) && value.urlMatcher.httpMethods.length > 0 &&
      value.urlMatcher.httpMethods.every((method) => typeof method === 'string') &&
      (value.environmentIds === undefined || (
        Array.isArray(value.environmentIds) &&
        value.environmentIds.every((id) => typeof id === 'string')
      ));
    if (!matcherValid) return false;

    if (value.type === 'responseOverride') {
      return (
        typeof value.body === 'string' &&
        (value.statusCode === undefined || (
          typeof value.statusCode === 'number' &&
          Number.isInteger(value.statusCode) &&
          Number(value.statusCode) >= 100 &&
          Number(value.statusCode) <= 599
        ))
      );
    }
    return (
      typeof value.statusCode === 'number' && Number.isInteger(value.statusCode) &&
      Number(value.statusCode) >= 200 &&
      Number(value.statusCode) <= 599 &&
      typeof value.responseBody === 'string' &&
      typeof value.delay === 'number' && Number.isFinite(value.delay) && value.delay >= 0 &&
      Array.isArray(value.responseHeaders) &&
      value.responseHeaders.every((header) =>
        isRecord(header) &&
        typeof header.name === 'string' &&
        typeof header.value === 'string' &&
        (header.operation === 'set' || header.operation === 'append' || header.operation === 'remove')
      )
    );
  }

  function isStoredEnvironment(value: unknown): value is StoredEnvironment {
    return (
      isRecord(value) &&
      typeof value.id === 'string' &&
      typeof value.isActive === 'boolean' &&
      Array.isArray(value.variables) &&
      value.variables.every((variable) =>
        isRecord(variable) &&
        typeof variable.key === 'string' &&
        typeof variable.value === 'string'
      )
    );
  }

  function resolve(text: string, environment: StoredEnvironment | undefined): string {
    if (!text || !environment) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const variable = environment.variables.find((candidate) => candidate.key === key);
      return variable ? variable.value : match;
    });
  }

  function matches(rule: BridgeRule, url: string, method: string): boolean {
    const methods = rule.urlMatcher.httpMethods;
    if (methods.length && !methods.includes('*') && !methods.includes(method.toUpperCase())) {
      return false;
    }
    const resources = rule.urlMatcher.resourceTypes;
    if (resources.length && !resources.includes('*') && !resources.includes('xmlhttprequest')) {
      return false;
    }
    const pattern = rule.urlMatcher.pattern;
    if (!pattern || pattern === '*') return true;
    try {
      if (rule.urlMatcher.isRegex) return new RegExp(pattern).test(url);
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`).test(url);
    } catch {
      return false;
    }
  }

  function payloadFor(rule: BridgeRule): MainRulePayload {
    if (rule.type === 'responseOverride') {
      return {
        id: rule.id,
        type: rule.type,
        ...(rule.statusCode !== undefined ? { statusCode: rule.statusCode } : {}),
        ...(rule.body !== undefined ? { body: rule.body } : {}),
      };
    }
    return {
      id: rule.id,
      type: rule.type,
      ...(rule.statusCode !== undefined ? { statusCode: rule.statusCode } : {}),
      ...(rule.responseBody !== undefined ? { responseBody: rule.responseBody } : {}),
      ...(rule.responseHeaders !== undefined ? { responseHeaders: rule.responseHeaders } : {}),
      ...(rule.delay !== undefined ? { delay: rule.delay } : {}),
    };
  }

  function publishStatus(): void {
    if (!readyId) return;
    window.postMessage({
      source: 'requestpilot-isolated',
      type: 'STATUS',
      channel,
      payload: {
        readyId,
        extensionEnabled,
        hasRules: rules.length > 0,
      },
    }, '*');
  }

  async function refreshConfiguration(): Promise<void> {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(['requestpilot_rules', 'requestpilot_environments']),
      chrome.storage.sync.get('requestpilot_settings'),
    ]);
    const environments = ((local.requestpilot_environments as unknown[] | undefined) ?? [])
      .filter(isStoredEnvironment);
    const environment = environments.find((candidate) => candidate.isActive);
    rules = ((local.requestpilot_rules as unknown[] | undefined) ?? [])
      .filter(isBridgeRule)
      .filter((rule) =>
        !rule.environmentIds?.length || Boolean(environment && rule.environmentIds.includes(environment.id))
      )
      .map((rule) => ({
        ...rule,
        urlMatcher: {
          ...rule.urlMatcher,
          pattern: resolve(rule.urlMatcher.pattern, environment),
        },
        responseBody: resolve(rule.responseBody ?? '', environment),
        body: resolve(rule.body ?? '', environment),
        responseHeaders: rule.responseHeaders?.map((header) => ({
          ...header,
          name: resolve(header.name, environment),
          value: resolve(header.value, environment),
        })),
      }))
      .filter((rule) => !/\{\{\w+\}\}/.test(JSON.stringify(rule)))
      .sort((a, b) => b.priority - a.priority);
    const settings = sync.requestpilot_settings as { extensionEnabled?: boolean } | undefined;
    extensionEnabled = settings?.extensionEnabled !== false;
    publishStatus();
  }

  // Page-world messaging is observable and forgeable. Keep every payload
  // request-scoped, validate its shape, and never treat this transport as a
  // confidentiality or authentication boundary.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== 'requestpilot-main') return;

    if (data.type === 'READY') {
      if (!isRecord(data.payload) || typeof data.payload.readyId !== 'string') return;
      readyId = data.payload.readyId;
      publishStatus();
      return;
    }
    if (data.channel !== channel || !isRecord(data.payload)) return;

    const payload = data.payload;
    if (data.type === 'MATCH_REQUEST') {
      if (
        typeof payload.requestId !== 'string' ||
        typeof payload.method !== 'string' ||
        typeof payload.url !== 'string'
      ) {
        return;
      }
      const matchedRule = extensionEnabled
        ? rules.find((rule) => matches(rule, payload.url as string, payload.method as string))
        : undefined;
      window.postMessage({
        source: 'requestpilot-isolated',
        type: 'MATCH_RESPONSE',
        channel,
        payload: {
          requestId: payload.requestId,
          rule: matchedRule ? payloadFor(matchedRule) : null,
        },
      }, '*');
      return;
    }

    if (data.type !== 'RULE_HIT') return;
    if (
      typeof payload.ruleId !== 'string' ||
      typeof payload.method !== 'string' ||
      typeof payload.url !== 'string'
    ) {
      return;
    }
    void chrome.runtime.sendMessage({
      type: 'LOG_MOCK_HIT',
      ruleId: payload.ruleId,
      method: payload.method,
      url: payload.url,
    }).catch(() => undefined);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === 'local' && (changes.requestpilot_rules || changes.requestpilot_environments)) ||
      (area === 'sync' && changes.requestpilot_settings)
    ) {
      void refreshConfiguration();
    }
  });

  void refreshConfiguration();
})();
