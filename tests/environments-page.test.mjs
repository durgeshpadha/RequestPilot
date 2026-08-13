import test from 'node:test';
import assert from 'node:assert/strict';
import { bindEnvironmentCreationButtons } from '../dist/utils/eventBindings.js';

test('both environment creation controls invoke the shared handler', () => {
  const listeners = [];
  const buttons = Array.from({ length: 2 }, () => ({
    addEventListener(type, listener) {
      assert.equal(type, 'click');
      listeners.push(listener);
    },
  }));
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-add-env]');
      return buttons;
    },
  };
  let creationRequests = 0;

  bindEnvironmentCreationButtons(root, () => { creationRequests += 1; });
  listeners.forEach((listener) => listener());

  assert.equal(listeners.length, 2);
  assert.equal(creationRequests, 2);
});
