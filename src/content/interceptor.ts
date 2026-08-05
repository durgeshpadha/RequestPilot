(() => {
  interface MainRule {
    id: string;
    type: 'mock' | 'responseOverride';
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Array<{ name: string; value: string; operation: string }>;
    delay?: number;
    body?: string;
  }

  interface MainStatus {
    extensionEnabled: boolean;
    hasRules: boolean;
  }

  interface PendingMatch {
    resolve: (rule: MainRule | null) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    signal?: AbortSignal;
    abortHandler?: () => void;
  }

  const MATCH_TIMEOUT_MS = 1000;
  let status: MainStatus = { extensionEnabled: false, hasRules: false };
  let channel = '';
  const pendingMatches = new Map<string, PendingMatch>();

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function asMainRule(value: unknown): MainRule | null {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      (value.type !== 'mock' && value.type !== 'responseOverride')
    ) {
      return null;
    }
    const responseHeaders = Array.isArray(value.responseHeaders)
      ? value.responseHeaders.filter((header): header is { name: string; value: string; operation: string } =>
          isRecord(header) &&
          typeof header.name === 'string' &&
          typeof header.value === 'string' &&
          typeof header.operation === 'string'
        )
      : undefined;
    return {
      id: value.id,
      type: value.type,
      ...(typeof value.statusCode === 'number' ? { statusCode: value.statusCode } : {}),
      ...(typeof value.responseBody === 'string' ? { responseBody: value.responseBody } : {}),
      ...(responseHeaders ? { responseHeaders } : {}),
      ...(typeof value.delay === 'number' ? { delay: value.delay } : {}),
      ...(typeof value.body === 'string' ? { body: value.body } : {}),
    };
  }

  function absoluteUrl(url: string): string {
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  function cleanupPending(pending: PendingMatch): void {
    clearTimeout(pending.timer);
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener('abort', pending.abortHandler);
    }
  }

  function settleMatch(requestId: string, rule: MainRule | null): void {
    const pending = pendingMatches.get(requestId);
    if (!pending) return;
    pendingMatches.delete(requestId);
    cleanupPending(pending);
    pending.resolve(rule);
  }

  function rejectMatch(requestId: string, error: unknown): void {
    const pending = pendingMatches.get(requestId);
    if (!pending) return;
    pendingMatches.delete(requestId);
    cleanupPending(pending);
    pending.reject(error);
  }

  function requestMatch(
    url: string,
    method: string,
    signal?: AbortSignal
  ): Promise<MainRule | null> {
    if (!channel || !status.extensionEnabled || !status.hasRules) {
      return Promise.resolve(null);
    }
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settleMatch(requestId, null), MATCH_TIMEOUT_MS);
      const abortHandler = signal
        ? () => rejectMatch(requestId, abortReason(signal))
        : undefined;
      pendingMatches.set(requestId, { resolve, reject, timer, signal, abortHandler });
      if (signal && abortHandler) signal.addEventListener('abort', abortHandler, { once: true });
      window.postMessage({
        source: 'requestpilot-main',
        type: 'MATCH_REQUEST',
        channel,
        payload: { requestId, url, method },
      }, '*');
    });
  }

  function waitForDelay(delay: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (delay <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortReason(signal as AbortSignal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  function responseHeaders(rule: MainRule): Headers {
    const headers = new Headers();
    for (const operation of rule.responseHeaders ?? []) {
      if (operation.operation === 'remove') headers.delete(operation.name);
      else if (operation.operation === 'append') headers.append(operation.name, operation.value);
      else headers.set(operation.name, operation.value);
    }
    if (!headers.has('content-type')) {
      try {
        JSON.parse(rule.responseBody ?? '');
        headers.set('content-type', 'application/json');
      } catch {
        headers.set('content-type', 'text/plain;charset=UTF-8');
      }
    }
    return headers;
  }

  function reportHit(rule: MainRule, method: string, url: string): void {
    if (!channel) return;
    window.postMessage({
      source: 'requestpilot-main',
      type: 'RULE_HIT',
      channel,
      payload: { ruleId: rule.id, method, url },
    }, '*');
  }

  function responseBodyForStatus(body: string, responseStatus: number): BodyInit | null {
    return responseStatus === 204 || responseStatus === 205 || responseStatus === 304 ? null : body;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function requestPilotFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (!status.extensionEnabled || !status.hasRules || !channel) return nativeFetch(input, init);
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const url = absoluteUrl(rawUrl);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const signal = init && 'signal' in init
      ? init.signal ?? undefined
      : input instanceof Request
        ? input.signal
        : undefined;

    const matchedRule = await requestMatch(url, method, signal);
    if (matchedRule?.type === 'mock') {
      const wait = Math.max(0, matchedRule.delay ?? 0);
      await waitForDelay(wait, signal);
      const responseStatus = matchedRule.statusCode ?? 200;
      const response = new Response(
        responseBodyForStatus(matchedRule.responseBody ?? '', responseStatus),
        { status: responseStatus, headers: responseHeaders(matchedRule) }
      );
      try {
        Object.defineProperty(response, 'url', { value: url });
      } catch { /* Browser-owned fields may be non-configurable. */ }
      reportHit(matchedRule, method, url);
      return response;
    }

    if (matchedRule?.type !== 'responseOverride') return nativeFetch(input, init);
    const original = await nativeFetch(input, init);
    const responseStatus = matchedRule.statusCode ?? original.status;
    if (responseStatus < 200 || responseStatus > 599) return original;
    const overriddenHeaders = new Headers(original.headers);
    overriddenHeaders.delete('content-length');
    overriddenHeaders.delete('content-encoding');
    overriddenHeaders.delete('etag');
    const response = new Response(
      responseBodyForStatus(matchedRule.body ?? '', responseStatus),
      {
        status: responseStatus,
        statusText: matchedRule.statusCode ? '' : original.statusText,
        headers: overriddenHeaders,
      }
    );
    for (const property of ['url', 'redirected', 'type'] as const) {
      try {
        Object.defineProperty(response, property, { value: original[property] });
      } catch { /* Browser-owned fields may be non-configurable. */ }
    }
    reportHit(matchedRule, method, url);
    return response;
  };

  const NativeXHR = window.XMLHttpRequest;

  class RequestPilotXHR extends NativeXHR {
    private requestUrl = '';
    private requestMethod = 'GET';
    private requestAsync = true;
    private requestGeneration = 0;
    private brokerPending = false;
    private mockRule: MainRule | null = null;
    private overrideRule: MainRule | null = null;
    private mockTimer: ReturnType<typeof setTimeout> | null = null;
    private mockHeaders = new Headers();
    private mockReadyState = 1;
    private mockComplete = false;
    private overrideApplied = false;

    constructor() {
      super();
      // Registered before page code can attach handlers, so overridden data is
      // available to application readystatechange/load listeners.
      this.addEventListener('readystatechange', () => {
        if (this.overrideRule && !this.overrideApplied && super.readyState === 4) {
          this.applyOverride(this.overrideRule);
        }
      });
    }

    open(method: string, url: string | URL, ...rest: unknown[]): void {
      this.requestMethod = method.toUpperCase();
      this.requestUrl = absoluteUrl(url instanceof URL ? url.href : String(url));
      this.requestAsync = rest[0] !== false;
      this.requestGeneration += 1;
      this.brokerPending = false;
      this.mockRule = null;
      this.overrideRule = null;
      this.mockComplete = false;
      this.overrideApplied = false;
      // TypeScript's DOM overloads cannot represent forwarding this variadic call.
      // @ts-expect-error Forward the browser-supported async/user/password arguments.
      super.open(method, url, ...rest);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (
        !status.extensionEnabled ||
        !status.hasRules ||
        !channel ||
        !this.requestAsync
      ) {
        super.send(body);
        return;
      }
      if (this.brokerPending) {
        throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
      }
      const generation = this.requestGeneration;
      this.brokerPending = true;
      void requestMatch(this.requestUrl, this.requestMethod).then((matchedRule) => {
        if (generation !== this.requestGeneration) return;
        this.brokerPending = false;
        if (matchedRule?.type === 'mock') {
          this.mockRule = matchedRule;
          this.serveMock(matchedRule);
          return;
        }
        this.overrideRule = matchedRule?.type === 'responseOverride' ? matchedRule : null;
        super.send(body);
      }).catch(() => {
        if (generation !== this.requestGeneration) return;
        this.brokerPending = false;
        super.send(body);
      });
    }

    abort(): void {
      if (this.brokerPending) {
        this.requestGeneration += 1;
        this.brokerPending = false;
        super.abort();
        return;
      }
      if (!this.mockRule || this.mockComplete) {
        super.abort();
        return;
      }
      if (this.mockTimer) clearTimeout(this.mockTimer);
      this.mockComplete = true;
      this.mockReadyState = 0;
      Object.defineProperty(this, 'readyState', {
        configurable: true,
        get: () => this.mockReadyState,
      });
      this.dispatchEvent(new ProgressEvent('abort'));
      this.dispatchEvent(new ProgressEvent('loadend'));
    }

    getResponseHeader(name: string): string | null {
      return this.mockRule ? this.mockHeaders.get(name) : super.getResponseHeader(name);
    }

    getAllResponseHeaders(): string {
      if (!this.mockRule) return super.getAllResponseHeaders();
      return Array.from(this.mockHeaders.entries())
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join('');
    }

    private typedResponse(text: string): unknown {
      if (this.responseType === 'json') {
        try { return JSON.parse(text); } catch { return null; }
      }
      if (this.responseType === 'blob') {
        return new Blob([text], { type: this.mockHeaders.get('content-type') ?? 'text/plain' });
      }
      if (this.responseType === 'arraybuffer') return new TextEncoder().encode(text).buffer;
      if (this.responseType === 'document') return new DOMParser().parseFromString(text, 'text/html');
      return text;
    }

    private defineResponse(
      text: string,
      responseStatus: number,
      responseStatusText: string,
      responseUrl: string
    ): void {
      const typed = this.typedResponse(text);
      Object.defineProperties(this, {
        status: { configurable: true, get: () => responseStatus },
        statusText: { configurable: true, get: () => responseStatusText },
        response: { configurable: true, get: () => typed },
        responseURL: { configurable: true, get: () => responseUrl },
      });
      if (!this.responseType || this.responseType === 'text') {
        Object.defineProperty(this, 'responseText', {
          configurable: true,
          get: () => text,
        });
      }
    }

    private transition(nextState: number): void {
      this.mockReadyState = nextState;
      Object.defineProperty(this, 'readyState', {
        configurable: true,
        get: () => this.mockReadyState,
      });
      this.dispatchEvent(new ProgressEvent('readystatechange'));
    }

    private serveMock(rule: MainRule): void {
      this.mockHeaders = responseHeaders(rule);
      const delay = Math.max(0, rule.delay ?? 0);
      const timeoutMs = this.timeout > 0 ? this.timeout : 0;
      const willTimeout = timeoutMs > 0 && delay > timeoutMs;
      this.mockTimer = setTimeout(() => {
        if (this.mockComplete) return;
        if (willTimeout) {
          this.mockComplete = true;
          this.transition(4);
          this.dispatchEvent(new ProgressEvent('timeout'));
          this.dispatchEvent(new ProgressEvent('loadend'));
          return;
        }
        const text = rule.responseBody ?? '';
        const responseStatus = rule.statusCode ?? 200;
        this.transition(2);
        this.transition(3);
        this.defineResponse(text, responseStatus, responseStatus === 200 ? 'OK' : '', this.requestUrl);
        this.transition(4);
        this.mockComplete = true;
        this.dispatchEvent(new ProgressEvent('load', {
          loaded: text.length,
          total: text.length,
          lengthComputable: true,
        }));
        this.dispatchEvent(new ProgressEvent('loadend'));
        reportHit(rule, this.requestMethod, this.requestUrl);
      }, willTimeout ? timeoutMs : delay);
    }

    private applyOverride(rule: MainRule): void {
      this.overrideApplied = true;
      const originalStatus = super.status;
      const text = rule.body ?? '';
      const responseStatus = rule.statusCode ?? originalStatus;
      this.defineResponse(text, responseStatus, rule.statusCode ? '' : super.statusText, super.responseURL);
      reportHit(rule, this.requestMethod, this.requestUrl);
    }
  }

  window.XMLHttpRequest = RequestPilotXHR;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as Record<string, unknown> | null;
    if (
      !data ||
      data.source !== 'requestpilot-isolated' ||
      typeof data.channel !== 'string' ||
      !isRecord(data.payload)
    ) {
      return;
    }
    if (channel && data.channel !== channel) return;

    const payload = data.payload;
    if (data.type === 'STATUS') {
      if (
        typeof payload.extensionEnabled !== 'boolean' ||
        typeof payload.hasRules !== 'boolean'
      ) {
        return;
      }
      channel = data.channel;
      status = {
        extensionEnabled: payload.extensionEnabled,
        hasRules: payload.hasRules,
      };
      if (!status.extensionEnabled || !status.hasRules) {
        Array.from(pendingMatches.keys()).forEach((requestId) => settleMatch(requestId, null));
      }
      return;
    }

    if (data.type !== 'MATCH_RESPONSE' || data.channel !== channel) return;
    if (typeof payload.requestId !== 'string') return;
    settleMatch(payload.requestId, asMainRule(payload.rule));
  });

  window.postMessage({ source: 'requestpilot-main', type: 'READY' }, '*');
})();
