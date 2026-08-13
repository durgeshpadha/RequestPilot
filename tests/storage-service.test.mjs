import test from 'node:test';
import assert from 'node:assert/strict';

function storageArea(data) {
  return {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: data[keys] };
      const result = {};
      for (const key of keys) result[key] = data[key];
      return result;
    },
    async set(values) {
      Object.assign(data, values);
    },
    async clear() {
      Object.keys(data).forEach((key) => delete data[key]);
    },
  };
}

test('merge import preserves exactly one active environment', async () => {
  const local = {
    requestpilot_rules: [],
    requestpilot_environments: [{
      id: 'existing',
      name: 'Existing',
      variables: [],
      isActive: true,
    }],
    requestpilot_usage: {},
  };
  const sync = {
    requestpilot_settings: {
      theme: 'system',
      defaultEnvironmentId: null,
      autoBackup: false,
      extensionEnabled: true,
      historyEnabled: true,
      redactSensitiveData: true,
      historyLimit: 500,
    },
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(local),
      sync: storageArea(sync),
    },
  };

  try {
    const { StorageService } = await import('../dist/storage/StorageService.js');
    await StorageService.getInstance().importAll({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      rules: [],
      environments: [{
        id: 'imported',
        name: 'Imported',
        variables: [],
        isActive: true,
      }],
    }, 'merge');

    assert.equal(local.requestpilot_environments.filter((environment) => environment.isActive).length, 1);
    assert.equal(local.requestpilot_environments.find((environment) => environment.isActive).id, 'existing');
  } finally {
    delete globalThis.chrome;
  }
});
