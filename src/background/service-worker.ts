import { storageService } from '../storage/StorageService.js';
import { applyDnrRules } from './ruleEngine.js';
import { appendHistory, appendHistoryBatch } from './historyManager.js';
import { redactSensitiveUrl, ruleMatchesRequest } from '../utils/ruleMatcher.js';
import type { AnyRule, Environment, Settings } from '../models/types.js';

let cachedRules: AnyRule[] = [];
let cachedEnvironment: Environment | null = null;
let cachedSettings: Settings | null = null;
let ruleSyncQueue: Promise<{ applied: number; errors: string[] }> = Promise.resolve({
  applied: 0,
  errors: [],
});

async function performRuleSync(): Promise<{ applied: number; errors: string[] }> {
  try {
    const [rules, settings, activeEnvironment] = await Promise.all([
      storageService.getRules(),
      storageService.getSettings(),
      storageService.getActiveEnvironment(),
    ]);
    cachedRules = rules;
    cachedSettings = settings;
    cachedEnvironment = activeEnvironment;
    const result = await applyDnrRules(rules, activeEnvironment, settings.extensionEnabled);
    if (result.errors.length) {
      console.warn('[RequestPilot] Some rules were not applied:', result.errors);
    }
    return result;
  } catch (error) {
    const message = String(error);
    console.error('[RequestPilot] Rule synchronization failed:', error);
    return { applied: 0, errors: [message] };
  }
}

function syncRules(): Promise<{ applied: number; errors: string[] }> {
  // Saving settings emits storage.onChanged while popup/options handlers may
  // request an immediate sync as well. Serialize both paths so two refreshes
  // cannot remove/add the same dynamic rule IDs concurrently.
  ruleSyncQueue = ruleSyncQueue.then(performRuleSync, performRuleSync);
  return ruleSyncQueue;
}

async function activateDefaultEnvironment(): Promise<void> {
  const settings = await storageService.getSettings();
  if (!settings.defaultEnvironmentId) return;
  const environments = await storageService.getEnvironments();
  if (environments.some((environment) => environment.id === settings.defaultEnvironmentId)) {
    await storageService.setActiveEnvironment(settings.defaultEnvironmentId, false);
  }
}

function withoutUsageCounts(value: unknown): string {
  if (!Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const { usageCount: _usageCount, ...rest } = item as Record<string, unknown>;
    return rest;
  }));
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' && area !== 'sync') return;
  const ruleChange = changes.requestpilot_rules;
  const rulesOnlyUsageChanged = ruleChange
    ? withoutUsageCounts(ruleChange.oldValue) === withoutUsageCounts(ruleChange.newValue)
    : false;
  const requiresSync =
    (!rulesOnlyUsageChanged && Boolean(ruleChange)) ||
    Boolean(changes.requestpilot_environments) ||
    Boolean(changes.requestpilot_settings);
  if (requiresSync) await syncRules();
});

chrome.runtime.onInstalled.addListener(async () => {
  await storageService.initialize();
  await syncRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await storageService.initialize();
  await activateDefaultEnvironment();
  await syncRules();
});

void storageService.initialize().then(syncRules);

// Store-compatible observation for history. Unlike onRuleMatchedDebug, webRequest
// observation is available in packaged builds. Rules are validated before DNR sync,
// so matching here mirrors the active rule configuration.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!cachedSettings?.extensionEnabled || !cachedSettings.historyEnabled) return undefined;
    const matching = cachedRules
      .filter((rule) =>
        rule.enabled &&
        rule.type !== 'mock' &&
        rule.type !== 'responseOverride' &&
        ruleMatchesRequest(
          rule,
          { url: details.url, method: details.method, resourceType: details.type },
          cachedEnvironment
        )
      )
      .sort((a, b) => b.priority - a.priority);
    if (!matching.length) return undefined;
    const redirectWinner = matching.find((rule) =>
      rule.type === 'redirect' || rule.type === 'queryParam'
    );
    const effective = matching.filter((rule) =>
      rule.type === 'header' ||
      rule.type === 'cookie' ||
      rule === redirectWinner
    );
    const url = cachedSettings.redactSensitiveData
      ? redactSensitiveUrl(details.url)
      : details.url;
    void appendHistoryBatch(effective.map((rule) => ({
      ruleName: rule.name,
      ruleId: rule.id,
      ruleType: rule.type,
      method: details.method,
      url,
      modificationType:
        rule.type === 'header' ? `Header ${rule.target === 'request' ? 'Request' : 'Response'} Modify` :
        rule.type === 'redirect' ? 'URL Redirect' :
        rule.type === 'queryParam' ? 'Query Param Modify' :
        'Cookie Modify',
      status: 'applied',
    })));
    return undefined;
  },
  { urls: ['<all_urls>'] }
);

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    const msg = message as { type: string };

    if (msg.type === 'SYNC_RULES') {
      syncRules()
        .then((result) => sendResponse({ ok: result.errors.length === 0, ...result }))
        .catch((error) => sendResponse({ ok: false, applied: 0, errors: [String(error)] }));
      return true;
    }

    if (msg.type === 'GET_STATUS') {
      storageService.getSettings().then((settings) => {
        sendResponse({ enabled: settings.extensionEnabled });
      });
      return true;
    }

    if (msg.type === 'TOGGLE_EXTENSION') {
      const enabled = (message as { enabled?: unknown }).enabled;
      if (typeof enabled !== 'boolean') {
        sendResponse({ ok: false, errors: ['Invalid enabled state.'] });
        return false;
      }
      storageService.getSettings()
        .then((settings) => storageService.saveSettings({ ...settings, extensionEnabled: enabled }))
        .then(syncRules)
        .then((result) => sendResponse({ ok: result.errors.length === 0, ...result }))
        .catch((error) => sendResponse({ ok: false, errors: [String(error)] }));
      return true;
    }

    if (msg.type === 'PING') {
      sendResponse({ status: 'ok', version: chrome.runtime.getManifest().version });
      return false;
    }

    if (msg.type === 'LOG_MOCK_HIT' && sender.tab) {
      const payload = message as {
        ruleId?: unknown;
        method?: unknown;
        url?: unknown;
        modificationType?: unknown;
      };
      if (
        typeof payload.ruleId !== 'string' ||
        typeof payload.method !== 'string' ||
        typeof payload.url !== 'string'
      ) {
        return false;
      }
      const rule = cachedRules.find((candidate) =>
        candidate.id === payload.ruleId &&
        candidate.enabled &&
        (candidate.type === 'mock' || candidate.type === 'responseOverride')
      );
      if (
        !rule ||
        !cachedSettings?.extensionEnabled ||
        !ruleMatchesRequest(rule, { url: payload.url, method: payload.method }, cachedEnvironment)
      ) {
        return false;
      }
      const url = cachedSettings.redactSensitiveData
        ? redactSensitiveUrl(payload.url)
        : payload.url;
      void appendHistory({
        ruleName: rule.name,
        ruleId: rule.id,
        ruleType: rule.type,
        method: payload.method,
        url,
        modificationType: rule.type === 'mock' ? 'Mock Response' : 'Response Override',
        status: 'applied',
      });
      return false;
    }

    return false;
  }
);
