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
  let messageIdSequence = 0;
  const pendingMatches = new Map<string, PendingMatch>();

  function createMessageId(): string {
    const random = new Uint32Array(4);
    crypto.getRandomValues(random);
    messageIdSequence = (messageIdSequence + 1) >>> 0;
    return `${Array.from(random, (part) => part.toString(16).padStart(8, '0')).join('')}-${messageIdSequence.toString(16)}`;
  }

  const readyId = createMessageId();

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

    const requestId = createMessageId();
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
    private requestStartedAt = 0;
    private requestTimeout = 0;
    private sendStarted = false;
    private nativeSendStarted = false;
    private brokerPending = false;
    private brokerAbortController: AbortController | null = null;
    private requestTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    private mockRule: MainRule | null = null;
    private overrideRule: MainRule | null = null;
    private mockTimer: ReturnType<typeof setTimeout> | null = null;
    private mockHeaders = new Headers();
    private mockReadyState = 1;
    private mockComplete = false;
    private overrideApplied = false;

    constructor() {
      super();
      this.requestTimeout = super.timeout;
      Object.defineProperties(this, {
        timeout: {
          configurable: true,
          enumerable: true,
          get: () => this.requestTimeout,
          set: (value: number) => this.setRequestTimeout(value),
        },
        withCredentials: {
          configurable: true,
          enumerable: true,
          get: () => this.getNativeWithCredentials(),
          set: (value: boolean) => this.setRequestWithCredentials(value),
        },
      });
      // Registered before page code can attach handlers, so overridden data is
      // available to application readystatechange/load listeners.
      this.addEventListener('readystatechange', () => {
        if (this.overrideRule && !this.overrideApplied && super.readyState === 4) {
          this.applyOverride(this.overrideRule);
        }
      });
      this.addEventListener('loadend', () => {
        this.sendStarted = false;
        this.nativeSendStarted = false;
        this.clearRequestTimeoutTimer();
      });
    }

    open(method: string, url: string | URL, ...rest: unknown[]): void {
      this.requestGeneration += 1;
      this.cancelSyntheticWork();
      this.clearSyntheticProperties();
      this.requestMethod = method.toUpperCase();
      this.requestUrl = absoluteUrl(url instanceof URL ? url.href : String(url));
      this.requestAsync = rest[0] !== false;
      this.requestStartedAt = 0;
      this.sendStarted = false;
      this.nativeSendStarted = false;
      this.brokerPending = false;
      this.mockRule = null;
      this.overrideRule = null;
      this.mockComplete = false;
      this.overrideApplied = false;
      // TypeScript's DOM overloads cannot represent forwarding this variadic call.
      // @ts-expect-error Forward the browser-supported async/user/password arguments.
      super.open(method, url, ...rest);
      super.timeout = this.requestTimeout;
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
      if (this.readyState !== 1 || this.sendStarted) {
        throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
      }
      const generation = this.requestGeneration;
      this.requestStartedAt = Date.now();
      this.sendStarted = true;
      this.brokerPending = true;
      this.brokerAbortController = new AbortController();
      this.scheduleSyntheticTimeout(generation);
      void requestMatch(
        this.requestUrl,
        this.requestMethod,
        this.brokerAbortController.signal
      ).then(
        (matchedRule) => this.finishBrokerRequest(generation, body, matchedRule),
        () => this.finishBrokerRequest(generation, body, null)
      );
    }

    abort(): void {
      if (this.sendStarted && !this.nativeSendStarted) {
        this.requestGeneration += 1;
        this.cancelSyntheticWork();
        this.brokerPending = false;
        this.sendStarted = false;
        this.mockComplete = true;
        this.dispatchSyntheticAbort();
        return;
      }
      if (this.mockComplete && Object.prototype.hasOwnProperty.call(this, 'readyState')) {
        super.abort();
        this.mockReadyState = 0;
        Object.defineProperty(this, 'readyState', {
          configurable: true,
          get: () => this.mockReadyState,
        });
        return;
      }
      if (!this.mockRule || this.mockComplete) {
        super.abort();
        return;
      }
      if (this.mockTimer) clearTimeout(this.mockTimer);
      this.mockComplete = true;
      this.sendStarted = false;
      this.dispatchSyntheticAbort();
    }

    setRequestHeader(name: string, value: string): void {
      if (this.readyState !== 1 || this.sendStarted) {
        throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
      }
      super.setRequestHeader(name, value);
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
      this.mockTimer = setTimeout(() => {
        if (this.mockComplete) return;
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
      }, delay);
    }

    private applyOverride(rule: MainRule): void {
      this.overrideApplied = true;
      const originalStatus = super.status;
      const text = rule.body ?? '';
      const responseStatus = rule.statusCode ?? originalStatus;
      this.defineResponse(text, responseStatus, rule.statusCode ? '' : super.statusText, super.responseURL);
      reportHit(rule, this.requestMethod, this.requestUrl);
    }

    private getNativeWithCredentials(): boolean {
      return super.withCredentials;
    }

    private setRequestWithCredentials(value: boolean): void {
      if ((this.readyState !== 0 && this.readyState !== 1) || this.sendStarted) {
        throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
      }
      super.withCredentials = value;
    }

    private setRequestTimeout(value: number): void {
      super.timeout = value;
      this.requestTimeout = super.timeout;
      if (!this.sendStarted) return;
      if (this.nativeSendStarted) {
        if (this.requestTimeout <= 0) {
          super.timeout = 0;
          return;
        }
        const remaining = this.remainingTimeout();
        super.timeout = remaining > 0 ? Math.max(1, Math.ceil(remaining)) : 1;
        return;
      }
      this.scheduleSyntheticTimeout(this.requestGeneration);
    }

    private remainingTimeout(): number {
      if (this.requestTimeout <= 0) return 0;
      return this.requestTimeout - Math.max(0, Date.now() - this.requestStartedAt);
    }

    private clearRequestTimeoutTimer(): void {
      if (this.requestTimeoutTimer !== null) {
        clearTimeout(this.requestTimeoutTimer);
        this.requestTimeoutTimer = null;
      }
    }

    private scheduleSyntheticTimeout(generation: number): void {
      this.clearRequestTimeoutTimer();
      if (!this.sendStarted || this.nativeSendStarted || this.requestTimeout <= 0) return;
      const remaining = this.remainingTimeout();
      this.requestTimeoutTimer = setTimeout(
        () => this.handleSyntheticTimeout(generation),
        Math.max(0, remaining)
      );
    }

    private handleSyntheticTimeout(generation: number): void {
      if (
        generation !== this.requestGeneration ||
        !this.sendStarted ||
        this.nativeSendStarted
      ) {
        return;
      }
      this.requestGeneration += 1;
      this.cancelSyntheticWork();
      this.brokerPending = false;
      this.sendStarted = false;
      this.mockComplete = true;
      this.mockHeaders = new Headers();
      this.transition(4);
      this.dispatchEvent(new ProgressEvent('timeout'));
      this.dispatchEvent(new ProgressEvent('loadend'));
    }

    private finishBrokerRequest(
      generation: number,
      body: Document | XMLHttpRequestBodyInit | null | undefined,
      matchedRule: MainRule | null
    ): void {
      if (
        generation !== this.requestGeneration ||
        !this.brokerPending ||
        !this.sendStarted
      ) {
        return;
      }
      this.brokerPending = false;
      this.brokerAbortController = null;
      if (matchedRule?.type === 'mock') {
        this.mockRule = matchedRule;
        this.serveMock(matchedRule);
        return;
      }

      const remaining = this.remainingTimeout();
      if (this.requestTimeout > 0 && remaining <= 0) {
        this.handleSyntheticTimeout(generation);
        return;
      }
      this.clearRequestTimeoutTimer();
      this.overrideRule = matchedRule?.type === 'responseOverride' ? matchedRule : null;
      if (this.requestTimeout > 0) {
        super.timeout = Math.max(1, Math.ceil(remaining));
      }
      this.nativeSendStarted = true;
      try {
        super.send(body);
      } catch (error) {
        this.nativeSendStarted = false;
        this.sendStarted = false;
        throw error;
      }
    }

    private cancelSyntheticWork(): void {
      this.brokerAbortController?.abort();
      this.brokerAbortController = null;
      this.clearRequestTimeoutTimer();
      if (this.mockTimer !== null) {
        clearTimeout(this.mockTimer);
        this.mockTimer = null;
      }
    }

    private dispatchSyntheticAbort(): void {
      super.abort();
      this.mockReadyState = 4;
      Object.defineProperty(this, 'readyState', {
        configurable: true,
        get: () => this.mockReadyState,
      });
      this.dispatchEvent(new ProgressEvent('readystatechange'));
      this.dispatchEvent(new ProgressEvent('abort'));
      this.dispatchEvent(new ProgressEvent('loadend'));
      this.mockReadyState = 0;
    }

    private clearSyntheticProperties(): void {
      for (const property of [
        'readyState',
        'status',
        'statusText',
        'response',
        'responseText',
        'responseURL',
      ]) {
        Reflect.deleteProperty(this, property);
      }
    }
  }

  window.XMLHttpRequest = RequestPilotXHR;

  // The host page can observe and forge window messages. Channel and request-ID
  // checks reject unrelated traffic but are correlation checks, not secrets.
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
        payload.readyId !== readyId ||
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

  window.postMessage({
    source: 'requestpilot-main',
    type: 'READY',
    payload: { readyId },
  }, '*');
})();
