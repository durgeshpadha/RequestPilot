(() => {
  interface BridgeRule {
    id: string;
    type: 'mock' | 'responseOverride';
    name: string;
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

  interface StoredEnvironment {
    id: string;
    isActive: boolean;
    variables: Array<{ key: string; value: string }>;
  }

  const channel = crypto.randomUUID();

  function resolve(text: string, environment: StoredEnvironment | undefined): string {
    if (!text || !environment) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const variable = environment.variables.find((candidate) => candidate.key === key);
      return variable ? variable.value : match;
    });
  }

  async function publishConfiguration(): Promise<void> {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(['requestpilot_rules', 'requestpilot_environments']),
      chrome.storage.sync.get('requestpilot_settings'),
    ]);
    const environments = (local.requestpilot_environments as StoredEnvironment[] | undefined) ?? [];
    const environment = environments.find((candidate) => candidate.isActive);
    const rules = ((local.requestpilot_rules as BridgeRule[] | undefined) ?? [])
      .filter((rule) =>
        rule.enabled &&
        (rule.type === 'mock' || rule.type === 'responseOverride') &&
        (!rule.environmentIds?.length || Boolean(environment && rule.environmentIds.includes(environment.id)))
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
      .sort((a, b) => b.priority - a.priority);
    const settings = sync.requestpilot_settings as { extensionEnabled?: boolean } | undefined;

    window.postMessage({
      source: 'requestpilot-isolated',
      type: 'CONFIG',
      channel,
      payload: {
        extensionEnabled: settings?.extensionEnabled !== false,
        rules,
      },
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as Record<string, unknown> | null;
    if (
      !data ||
      data.source !== 'requestpilot-main' ||
      data.type !== 'RULE_HIT' ||
      data.channel !== channel ||
      typeof data.payload !== 'object' ||
      data.payload === null
    ) {
      return;
    }
    const payload = data.payload as Record<string, unknown>;
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
      modificationType: payload.modificationType,
    }).catch(() => undefined);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === 'local' && (changes.requestpilot_rules || changes.requestpilot_environments)) ||
      (area === 'sync' && changes.requestpilot_settings)
    ) {
      void publishConfiguration();
    }
  });

  void publishConfiguration();
})();
