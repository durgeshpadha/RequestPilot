import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDnrRules, buildDnrRules } from '../dist/background/ruleEngine.js';
import { validateExportSchema, validateRule } from '../dist/validation/schema.js';
import {
  matchesUrlPattern,
  redactSensitiveUrl,
  ruleMatchesRequest,
} from '../dist/utils/ruleMatcher.js';

const base = {
  name: 'Rule',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  priority: 1,
  urlMatcher: {
    pattern: 'https://api.example.com/*',
    isRegex: false,
    resourceTypes: ['xmlhttprequest'],
    httpMethods: ['GET'],
  },
};

test('DNR IDs remain unique for a large rule set', () => {
  const rules = Array.from({ length: 3000 }, (_, index) => ({
    ...base,
    id: `rule-${index}`,
    type: 'redirect',
    redirectUrl: `https://target.example.com/${index}`,
  }));
  const compiled = buildDnrRules(rules, null);
  assert.equal(compiled.length, rules.length);
  assert.equal(new Set(compiled.map((rule) => rule.id)).size, rules.length);
});

test('document resource type maps to Chromium frame types', () => {
  const compiled = buildDnrRules([{
    ...base,
    id: 'document-rule',
    type: 'redirect',
    redirectUrl: 'https://target.example.com/',
    urlMatcher: { ...base.urlMatcher, resourceTypes: ['document'] },
  }], null);
  assert.deepEqual(compiled[0].condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('DNR conditions use the same case-sensitive URL matching as JavaScript', () => {
  const compiled = buildDnrRules([{
    ...base,
    id: 'case-sensitive-rule',
    type: 'redirect',
    redirectUrl: 'https://target.example.com/',
    urlMatcher: { ...base.urlMatcher, pattern: 'https://api.example.com/Admin/*' },
  }], null);
  assert.equal(compiled[0].condition.isUrlFilterCaseSensitive, true);
  assert.equal(
    matchesUrlPattern(
      'https://api.example.com/Admin/*',
      false,
      'https://api.example.com/admin/users'
    ),
    false
  );
});

test('request header append validation follows Chromium allowlist', () => {
  const invalid = validateRule({
    ...base,
    id: 'bad-header',
    type: 'header',
    target: 'request',
    headers: [{ name: 'X-Custom', value: 'a', operation: 'append' }],
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /cannot append/i);

  const valid = validateRule({
    ...base,
    id: 'good-header',
    type: 'header',
    target: 'request',
    headers: [{ name: 'Cookie', value: 'a=b', operation: 'append' }],
  });
  assert.equal(valid.valid, true);
});

test('matching honors URL, method, and resource filters', () => {
  const rule = {
    ...base,
    id: 'match-rule',
    type: 'redirect',
    redirectUrl: 'https://target.example.com/',
  };
  assert.equal(ruleMatchesRequest(
    rule,
    { url: 'https://api.example.com/users', method: 'GET', resourceType: 'xmlhttprequest' },
    null
  ), true);
  assert.equal(ruleMatchesRequest(
    rule,
    { url: 'https://api.example.com/users', method: 'POST', resourceType: 'xmlhttprequest' },
    null
  ), false);
  assert.equal(matchesUrlPattern('https://*.example.com/*', false, 'https://api.example.com/a'), true);
});

test('history redaction removes common sensitive query values', () => {
  const redacted = redactSensitiveUrl(
    'https://example.com/path?token=abc&name=Akash&api_key=secret'
  );
  assert.match(redacted, /name=Akash/);
  assert.doesNotMatch(redacted, /abc|secret/);
});

test('import validation rejects duplicate IDs and malformed environments', () => {
  const rule = {
    ...base,
    id: 'duplicate',
    type: 'redirect',
    redirectUrl: 'https://target.example.com/',
  };
  const result = validateExportSchema({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules: [rule, rule],
    environments: [{
      id: 'env',
      name: 'Development',
      isActive: true,
      variables: [
        { key: 'TOKEN', value: 'one' },
        { key: 'TOKEN', value: 'two' },
      ],
    }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /duplicate/i);
});

test('import validation returns errors for null environments instead of throwing', () => {
  const result = validateExportSchema({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules: [],
    environments: [null],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /environment 1 must be an object/i);
});

test('import validation enforces the browser-network regex quota', () => {
  const rules = Array.from({ length: 1001 }, (_, index) => ({
    ...base,
    id: `regex-${index}`,
    type: 'redirect',
    redirectUrl: `https://target.example.com/${index}`,
    urlMatcher: {
      ...base.urlMatcher,
      pattern: '^https://api\\.example\\.com/',
      isRegex: true,
    },
  }));
  const result = validateExportSchema({
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules,
    environments: [],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /at most 1,000 regular-expression/i);
});

test('rule synchronization reports only rules that were actually activated', async () => {
  const updates = [];
  globalThis.chrome = {
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async (update) => { updates.push(update); },
    },
  };
  const invalidHeader = {
    ...base,
    id: 'invalid-header',
    type: 'header',
    target: 'request',
    headers: [{ name: 'X-Custom', value: 'value', operation: 'append' }],
  };
  const validRedirect = {
    ...base,
    id: 'valid-redirect',
    type: 'redirect',
    redirectUrl: 'https://target.example.com/',
  };

  try {
    const result = await applyDnrRules([invalidHeader, validRedirect], null, true);
    assert.equal(result.synchronized, true);
    assert.deepEqual(result.activeRuleIds, ['valid-redirect']);
    assert.equal(updates[0].addRules.length, 1);
  } finally {
    delete globalThis.chrome;
  }
});

test('rule synchronization activates at most 1,000 DNR regex rules', async () => {
  let addedRules = [];
  globalThis.chrome = {
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async (update) => { addedRules = update.addRules; },
    },
  };
  const rules = Array.from({ length: 1001 }, (_, index) => ({
    ...base,
    id: `runtime-regex-${index}`,
    type: 'redirect',
    redirectUrl: `https://target.example.com/${index}`,
    urlMatcher: {
      ...base.urlMatcher,
      pattern: '^https://api\\.example\\.com/',
      isRegex: true,
    },
  }));

  try {
    const result = await applyDnrRules(rules, null, true);
    assert.equal(result.synchronized, true);
    assert.equal(result.applied, 1000);
    assert.equal(addedRules.length, 1000);
    assert.match(result.errors.join(' '), /1,000 highest-priority/i);
  } finally {
    delete globalThis.chrome;
  }
});

test('rules apply only in their selected environments', () => {
  const development = {
    id: 'environment-development',
    name: 'Development',
    variables: [{ key: 'ROUTING_VALUE', value: 'development' }],
    isActive: true,
  };
  const production = {
    id: 'environment-production',
    name: 'Production',
    variables: [{ key: 'ROUTING_VALUE', value: 'production' }],
    isActive: false,
  };
  const rule = {
    ...base,
    id: 'environment-specific-rule',
    type: 'header',
    target: 'request',
    environmentIds: [development.id],
    headers: [{ name: 'X-Routing-Value', value: '{{ROUTING_VALUE}}', operation: 'set' }],
  };

  assert.equal(buildDnrRules([rule], null).length, 0);
  assert.equal(buildDnrRules([rule], production).length, 0);
  assert.equal(buildDnrRules([rule], development).length, 1);
  assert.equal(
    buildDnrRules([rule], development)[0].action.requestHeaders[0].value,
    'development'
  );
});
