import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeXMLHttpRequest extends EventTarget {
  timeout = 0;
  responseType = '';
  readyState = 0;
  status = 0;
  statusText = '';
  responseURL = '';

  open() {
    this.readyState = 1;
  }

  send() {}
  abort() {}
  getResponseHeader() { return null; }
  getAllResponseHeaders() { return ''; }
}

test('mocked fetch rejects when its AbortSignal is cancelled', async () => {
  const source = fs.readFileSync(path.join(root, 'dist/content/interceptor.js'), 'utf8');
  const messageListeners = [];
  let nativeFetchCalls = 0;
  let notifyMatchResponse;
  const matchResponded = new Promise((resolve) => { notifyMatchResponse = resolve; });

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
      queueMicrotask(() => {
        messageListeners.forEach((listener) => listener({ source: windowObject, data: message }));
        if (message.type !== 'MATCH_REQUEST') return;
        const response = {
          source: 'requestpilot-isolated',
          type: 'MATCH_RESPONSE',
          channel: 'test-channel',
          payload: {
            requestId: message.payload.requestId,
            rule: {
              id: 'mock-rule',
              type: 'mock',
              statusCode: 200,
              responseBody: '{"ok":true}',
              responseHeaders: [],
              delay: 1000,
            },
          },
        };
        messageListeners.forEach((listener) => listener({ source: windowObject, data: response }));
        notifyMatchResponse();
      });
    },
  };
  const context = vm.createContext({
    window: windowObject,
    location: { href: 'https://app.example.com/' },
    URL,
    Request,
    Response,
    Headers,
    Blob,
    TextEncoder,
    EventTarget,
    DOMException,
    AbortSignal,
    crypto: globalThis.crypto,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  vm.runInContext(source, context, { filename: 'dist/content/interceptor.js' });
  messageListeners.forEach((listener) => listener({
    source: windowObject,
    data: {
      source: 'requestpilot-isolated',
      type: 'STATUS',
      channel: 'test-channel',
      payload: { extensionEnabled: true, hasRules: true },
    },
  }));

  const controller = new AbortController();
  const request = windowObject.fetch('https://api.example.com/users', {
    signal: controller.signal,
  });
  await matchResponded;
  controller.abort();

  await assert.rejects(request, (error) => error?.name === 'AbortError');
  assert.equal(nativeFetchCalls, 0);
});
