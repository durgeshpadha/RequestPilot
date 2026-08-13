import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bridge limits an observed-channel request to one matched page-visible payload', async () => {
  const source = fs.readFileSync(path.join(root, 'dist/content/bridge.js'), 'utf8');
  const listeners = [];
  const posted = [];
  const runtimeMessages = [];
  const windowObject = {
    addEventListener(type, listener) {
      if (type === 'message') listeners.push(listener);
    },
    postMessage(message) {
      posted.push(message);
    },
  };
  const dispatch = (data) => {
    listeners.forEach((listener) => listener({ source: windowObject, data }));
  };
  const rules = [
    {
      id: 'matched',
      type: 'mock',
      enabled: true,
      priority: 10,
      urlMatcher: {
        pattern: 'http://api.example.com/*',
        isRegex: false,
        resourceTypes: ['xmlhttprequest'],
        httpMethods: ['GET'],
      },
      statusCode: 200,
      responseBody: '{{VISIBLE_VALUE}}',
      responseHeaders: [],
      delay: 0,
    },
    {
      id: 'unmatched',
      type: 'mock',
      enabled: true,
      priority: 5,
      urlMatcher: {
        pattern: 'http://other.example.com/*',
        isRegex: false,
        resourceTypes: ['xmlhttprequest'],
        httpMethods: ['GET'],
      },
      statusCode: 200,
      responseBody: '{{UNMATCHED_VALUE}}',
      responseHeaders: [],
      delay: 0,
    },
  ];
  const chrome = {
    storage: {
      local: {
        async get() {
          return {
            requestpilot_rules: rules,
            requestpilot_environments: [{
              id: 'active',
              isActive: true,
              variables: [
                { key: 'VISIBLE_VALUE', value: 'page-visible-value' },
                { key: 'UNMATCHED_VALUE', value: 'unmatched-value' },
              ],
            }],
          };
        },
      },
      sync: {
        async get() {
          return { requestpilot_settings: { extensionEnabled: true } };
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      async sendMessage(message) {
        runtimeMessages.push(message);
      },
    },
  };
  let randomPart = 0;
  const crypto = {
    getRandomValues(target) {
      target.fill(++randomPart);
      return target;
    },
  };
  const context = vm.createContext({ window: windowObject, chrome, crypto, console, URL });
  vm.runInContext(source, context, { filename: 'dist/content/bridge.js' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(posted.some((message) => message.type === 'STATUS'), false);
  dispatch({
    source: 'requestpilot-main',
    type: 'READY',
    payload: { readyId: 'main-ready-id' },
  });
  const status = posted.find((message) => message.type === 'STATUS');
  assert.ok(status);
  assert.equal(status.payload.readyId, 'main-ready-id');
  assert.equal('randomUUID' in crypto, false);

  const responseCount = () => posted.filter((message) => message.type === 'MATCH_RESPONSE').length;
  dispatch({
    source: 'requestpilot-main',
    type: 'MATCH_REQUEST',
    channel: 'forged-channel',
    payload: { requestId: 'wrong-channel', url: 'http://api.example.com/users', method: 'GET' },
  });
  dispatch({
    source: 'requestpilot-main',
    type: 'MATCH_RESPONSE',
    channel: status.channel,
    payload: { requestId: 'forged-response', rule: { id: 'forged' } },
  });
  dispatch({
    source: 'requestpilot-main',
    type: 'STATUS',
    channel: status.channel,
    payload: { extensionEnabled: false, hasRules: false },
  });
  assert.equal(responseCount(), 0);
  assert.equal(runtimeMessages.length, 0);

  dispatch({
    source: 'requestpilot-main',
    type: 'MATCH_REQUEST',
    channel: status.channel,
    payload: { requestId: 'observed-channel', url: 'http://api.example.com/users', method: 'GET' },
  });

  const response = posted.find((message) =>
    message.type === 'MATCH_RESPONSE' && message.payload.requestId === 'observed-channel'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(response.payload.rule)),
    {
      id: 'matched',
      type: 'mock',
      statusCode: 200,
      responseBody: 'page-visible-value',
      responseHeaders: [],
      delay: 0,
    }
  );
  assert.doesNotMatch(JSON.stringify(response), /unmatched|UNMATCHED_VALUE/i);
});
