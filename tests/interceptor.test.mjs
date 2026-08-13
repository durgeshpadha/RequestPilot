import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeProgressEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    Object.assign(this, init);
  }
}

class FakeXMLHttpRequest extends EventTarget {
  readyState = 0;
  status = 0;
  statusText = '';
  responseURL = '';
  responseType = '';
  nativeSendAttempts = 0;
  nativeSendCalls = 0;
  nativeTimeoutAtSend = null;
  nativeSendError = null;
  requestHeaders = [];
  _nativeTimeout = 0;
  _nativeWithCredentials = false;
  _sendFlag = false;

  get timeout() {
    return this._nativeTimeout;
  }

  set timeout(value) {
    this._nativeTimeout = Number(value);
  }

  get withCredentials() {
    return this._nativeWithCredentials;
  }

  set withCredentials(value) {
    if ((this.readyState !== 0 && this.readyState !== 1) || this._sendFlag) {
      throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
    }
    this._nativeWithCredentials = Boolean(value);
  }

  open() {
    this.readyState = 1;
    this._sendFlag = false;
  }

  send() {
    if (this.readyState !== 1 || this._sendFlag) {
      throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
    }
    this.nativeSendAttempts += 1;
    if (this.nativeSendError) throw this.nativeSendError;
    this._sendFlag = true;
    this.nativeSendCalls += 1;
    this.nativeTimeoutAtSend = this._nativeTimeout;
  }

  abort() {
    const wasSending = this._sendFlag;
    this._sendFlag = false;
    this.readyState = 0;
    if (wasSending) {
      this.dispatchEvent(new FakeProgressEvent('abort'));
      this.dispatchEvent(new FakeProgressEvent('loadend'));
    }
  }

  setRequestHeader(name, value) {
    if (this.readyState !== 1 || this._sendFlag) {
      throw new DOMException('The object is in an invalid state.', 'InvalidStateError');
    }
    this.requestHeaders.push([name, value]);
  }

  getResponseHeader() { return null; }
  getAllResponseHeaders() { return ''; }
}

function insecureContextCrypto() {
  let next = 1;
  return {
    getRandomValues(target) {
      for (let index = 0; index < target.length; index += 1) {
        target[index] = next;
        next += 1;
      }
      return target;
    },
  };
}

function installInterceptor({ onMatchRequest } = {}) {
  const source = fs.readFileSync(path.join(root, 'dist/content/interceptor.js'), 'utf8');
  const messageListeners = [];
  const postedMessages = [];
  const consoleErrors = [];
  let nativeFetchCalls = 0;

  const windowObject = {
    fetch: async () => {
      nativeFetchCalls += 1;
      return new Response('native');
    },
    XMLHttpRequest: FakeXMLHttpRequest,
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.push(listener);
    },
    postMessage(message) {
      postedMessages.push(message);
      queueMicrotask(() => {
        dispatch(message);
        if (message.type === 'MATCH_REQUEST') {
          onMatchRequest?.(message, dispatch);
        }
      });
    },
  };

  function dispatch(data) {
    messageListeners.forEach((listener) => listener({ source: windowObject, data }));
  }

  const crypto = insecureContextCrypto();
  const testConsole = Object.create(console);
  testConsole.error = (...args) => consoleErrors.push(args);
  const context = vm.createContext({
    window: windowObject,
    location: { href: 'http://app.example.com/' },
    URL,
    Request,
    Response,
    Headers,
    Blob,
    TextEncoder,
    EventTarget,
    DOMException,
    AbortController,
    AbortSignal,
    ProgressEvent: FakeProgressEvent,
    crypto,
    console: testConsole,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  vm.runInContext(source, context, { filename: 'dist/content/interceptor.js' });

  return {
    windowObject,
    postedMessages,
    consoleErrors,
    dispatch,
    activate(channel = 'test-channel') {
      const ready = postedMessages.find((message) => message.type === 'READY');
      dispatch({
        source: 'requestpilot-isolated',
        type: 'STATUS',
        channel,
        payload: {
          readyId: ready.payload.readyId,
          extensionEnabled: true,
          hasRules: true,
        },
      });
    },
    get nativeFetchCalls() {
      return nativeFetchCalls;
    },
  };
}

function matchResponse(message, rule, channel = message.channel) {
  return {
    source: 'requestpilot-isolated',
    type: 'MATCH_RESPONSE',
    channel,
    payload: { requestId: message.payload.requestId, rule },
  };
}

test('mocked fetch works without crypto.randomUUID and rejects on abort', async () => {
  let notifyMatchResponse;
  const matchResponded = new Promise((resolve) => { notifyMatchResponse = resolve; });
  const harness = installInterceptor({
    onMatchRequest(message, dispatch) {
      dispatch(matchResponse(message, {
        id: 'mock-rule',
        type: 'mock',
        statusCode: 200,
        responseBody: '{"ok":true}',
        responseHeaders: [],
        delay: 1000,
      }));
      notifyMatchResponse();
    },
  });
  harness.activate();

  const controller = new AbortController();
  const request = harness.windowObject.fetch('http://api.example.com/users', {
    signal: controller.signal,
  });
  await matchResponded;
  controller.abort();

  await assert.rejects(request, (error) => error?.name === 'AbortError');
  assert.equal(harness.nativeFetchCalls, 0);
});

test('forged status and match responses with the wrong channel or request ID are ignored', async () => {
  const harness = installInterceptor({
    onMatchRequest(message, dispatch) {
      dispatch(matchResponse(message, {
        id: 'forged-rule',
        type: 'mock',
        statusCode: 200,
        responseBody: 'forged',
        responseHeaders: [],
        delay: 0,
      }, 'forged-channel'));
      dispatch({
        ...matchResponse(message, null),
        payload: { requestId: 'unknown-request', rule: null },
      });
      dispatch(matchResponse(message, null));
    },
  });
  harness.dispatch({
    source: 'requestpilot-isolated',
    type: 'STATUS',
    channel: 'forged-channel',
    payload: {
      readyId: 'forged-ready-id',
      extensionEnabled: false,
      hasRules: false,
    },
  });
  harness.activate();
  harness.dispatch({
    source: 'requestpilot-isolated',
    type: 'STATUS',
    channel: 'forged-channel',
    payload: {
      readyId: harness.postedMessages.find((message) => message.type === 'READY').payload.readyId,
      extensionEnabled: false,
      hasRules: false,
    },
  });

  const response = await harness.windowObject.fetch('http://api.example.com/users');
  assert.equal(await response.text(), 'native');
  assert.equal(harness.nativeFetchCalls, 1);
  assert.equal(
    harness.postedMessages.find((message) => message.type === 'MATCH_REQUEST').channel,
    'test-channel'
  );
});

test('XHR send state is observable while the match broker is pending', () => {
  const harness = installInterceptor();
  harness.activate();
  const request = new harness.windowObject.XMLHttpRequest();

  assert.throws(() => request.send(), (error) => error?.name === 'InvalidStateError');
  request.open('GET', 'http://api.example.com/users');
  request.send();
  assert.equal(request.nativeSendCalls, 0);
  assert.throws(
    () => request.setRequestHeader('X-Late', 'value'),
    (error) => error?.name === 'InvalidStateError'
  );
  assert.throws(
    () => { request.withCredentials = true; },
    (error) => error?.name === 'InvalidStateError'
  );
  assert.throws(() => request.send(), (error) => error?.name === 'InvalidStateError');
  request.abort();
});

test('XHR abort before a broker match emits abort and loadend without native send', async () => {
  let pendingMessage;
  const harness = installInterceptor({
    onMatchRequest(message) {
      pendingMessage = message;
    },
  });
  harness.activate();
  const request = new harness.windowObject.XMLHttpRequest();
  const events = [];
  request.addEventListener('abort', () => events.push('abort'));
  request.addEventListener('loadend', () => events.push('loadend'));

  request.open('GET', 'http://api.example.com/users');
  request.send();
  await new Promise((resolve) => setTimeout(resolve, 0));
  request.abort();
  harness.dispatch(matchResponse(pendingMessage, null));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events, ['abort', 'loadend']);
  assert.equal(request.readyState, 0);
  assert.equal(request.nativeSendCalls, 0);
});

test('XHR timeout includes time spent waiting for the broker', async () => {
  const harness = installInterceptor();
  harness.activate();
  const request = new harness.windowObject.XMLHttpRequest();
  const events = [];
  request.addEventListener('timeout', () => events.push('timeout'));
  request.addEventListener('loadend', () => events.push('loadend'));

  request.open('GET', 'http://api.example.com/users');
  request.timeout = 25;
  const startedAt = Date.now();
  request.send();
  await new Promise((resolve) => request.addEventListener('loadend', resolve, { once: true }));
  const elapsed = Date.now() - startedAt;

  assert.deepEqual(events, ['timeout', 'loadend']);
  assert.equal(request.readyState, 4);
  assert.equal(request.nativeSendCalls, 0);
  assert.ok(elapsed < 250, `expected broker timeout near 25ms, received ${elapsed}ms`);
});

test('XHR passes only the remaining timeout budget to native send', async () => {
  const harness = installInterceptor({
    onMatchRequest(message, dispatch) {
      setTimeout(() => dispatch(matchResponse(message, null)), 30);
    },
  });
  harness.activate();
  const request = new harness.windowObject.XMLHttpRequest();

  request.open('GET', 'http://api.example.com/users');
  request.timeout = 200;
  request.send();
  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(request.nativeSendCalls, 1);
  assert.ok(request.nativeTimeoutAtSend > 0);
  assert.ok(request.nativeTimeoutAtSend < 200);
  assert.equal(request.timeout, 200);
  request.abort();
});

test('XHR reports a deferred native send failure without an unhandled rejection', async () => {
  const harness = installInterceptor({
    onMatchRequest(message, dispatch) {
      dispatch(matchResponse(message, null));
    },
  });
  harness.activate();
  const request = new harness.windowObject.XMLHttpRequest();
  const events = [];
  const unhandledRejections = [];
  const onUnhandledRejection = (error) => unhandledRejections.push(error);
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    request.open('POST', 'http://api.example.com/users');
    request.nativeSendError = new DOMException('Native send failed.', 'NetworkError');
    request.addEventListener('readystatechange', () => events.push('readystatechange'));
    request.addEventListener('error', () => events.push('error'));
    const loadend = new Promise((resolve) => {
      request.addEventListener('loadend', () => {
        events.push('loadend');
        resolve();
      }, { once: true });
    });

    assert.doesNotThrow(() => request.send('body'));
    await loadend;
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(request.nativeSendAttempts, 1);
    assert.equal(request.nativeSendCalls, 0);
    assert.equal(request.readyState, 4);
    assert.deepEqual(events, ['readystatechange', 'error', 'loadend']);
    assert.deepEqual(unhandledRejections, []);
    assert.equal(harness.consoleErrors.length, 1);
    assert.match(harness.consoleErrors[0][0], /native XMLHttpRequest\.send failed/i);
  } finally {
    process.removeListener('unhandledRejection', onUnhandledRejection);
  }
});
