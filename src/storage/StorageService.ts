import type { AnyRule, Environment, Settings, HistoryEntry, ExportSchema } from '../models/types.js';
import { STORAGE_KEYS } from '../models/types.js';
import { asExportSchema } from '../validation/schema.js';

// ============================================================
// Default Settings — used on first install and after reset
// ============================================================

const CURRENT_SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultEnvironmentId: null,
  autoBackup: false,
  extensionEnabled: true,
  historyEnabled: true,
  redactSensitiveData: true,
  historyLimit: 500,
};

// ============================================================
// Storage Service
// ============================================================

export class StorageService {
  private static instance: StorageService;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // ----------------------------------------------------------
  // Initialization — seeds empty state on first install
  // ----------------------------------------------------------

  async initialize(): Promise<void> {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.INITIALIZED,
      STORAGE_KEYS.SCHEMA_VERSION,
    ]);
    if (!result[STORAGE_KEYS.INITIALIZED]) {
      await this.initEmpty();
      await chrome.storage.local.set({
        [STORAGE_KEYS.INITIALIZED]: true,
        [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
      });
      return;
    }
    await this.migrate(Number(result[STORAGE_KEYS.SCHEMA_VERSION] ?? 1));
  }

  private async initEmpty(): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.RULES]:        [],
      [STORAGE_KEYS.ENVIRONMENTS]: [],
      [STORAGE_KEYS.HISTORY]:      [],
      [STORAGE_KEYS.USAGE]:        {},
    });
    await chrome.storage.sync.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    });
  }

  private async migrate(fromVersion: number): Promise<void> {
    if (fromVersion < 2) {
      const settings = await this.getSettings();
      await chrome.storage.sync.set({
        [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, ...settings },
      });
    }
    if (fromVersion < 3) {
      const result = await chrome.storage.local.get([STORAGE_KEYS.RULES, STORAGE_KEYS.USAGE]);
      const rules = (result[STORAGE_KEYS.RULES] as AnyRule[] | undefined) ?? [];
      const usage = (result[STORAGE_KEYS.USAGE] as Record<string, number> | undefined) ?? {};
      rules.forEach((rule) => {
        if (rule.usageCount) usage[rule.id] = rule.usageCount;
      });
      await this.writeRules(rules);
      await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    });
  }

  // ----------------------------------------------------------
  // Rules
  // ----------------------------------------------------------

  async getRules(): Promise<AnyRule[]> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.RULES, STORAGE_KEYS.USAGE]);
    const usage = (result[STORAGE_KEYS.USAGE] as Record<string, number> | undefined) ?? {};
    return ((result[STORAGE_KEYS.RULES] as AnyRule[]) || []).map((rule) => ({
      ...rule,
      usageCount: usage[rule.id] ?? rule.usageCount ?? 0,
    }));
  }

  private async writeRules(rules: AnyRule[]): Promise<void> {
    const serialized = rules.map((rule) => {
      const { usageCount: _usageCount, ...storedRule } = rule;
      return storedRule as AnyRule;
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: serialized });
  }

  async saveRule(rule: AnyRule): Promise<void> {
    await this.maybeAutoBackup();
    const rules = await this.getRules();
    const now = new Date().toISOString();
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      rules[idx] = { ...rule, updatedAt: now };
    } else {
      rules.push({ ...rule, id: rule.id || crypto.randomUUID(), createdAt: now, updatedAt: now });
    }
    await this.writeRules(rules);
  }

  async deleteRule(id: string): Promise<void> {
    await this.maybeAutoBackup();
    const rules = await this.getRules();
    await this.writeRules(rules.filter((r) => r.id !== id));
    const usageResult = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
    const usage = (usageResult[STORAGE_KEYS.USAGE] as Record<string, number> | undefined) ?? {};
    delete usage[id];
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
  }

  async duplicateRule(id: string): Promise<AnyRule | null> {
    await this.maybeAutoBackup();
    const rules = await this.getRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return null;
    const now = new Date().toISOString();
    const copy: AnyRule = {
      ...rule,
      id: crypto.randomUUID(),
      name: `${rule.name} (Copy)`,
      enabled: false,
      createdAt: now,
      updatedAt: now,
    } as AnyRule;
    rules.push(copy);
    await this.writeRules(rules);
    return copy;
  }

  async toggleRule(id: string, enabled: boolean): Promise<void> {
    await this.maybeAutoBackup();
    const rules = await this.getRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], enabled, updatedAt: new Date().toISOString() };
      await this.writeRules(rules);
    }
  }

  async toggleRulesByType(type: AnyRule['type'], enabled: boolean): Promise<void> {
    await this.maybeAutoBackup();
    const rules = await this.getRules();
    const now = new Date().toISOString();
    let changed = false;
    rules.forEach((rule) => {
      if (rule.type === type && rule.enabled !== enabled) {
        rule.enabled = enabled;
        rule.updatedAt = now;
        changed = true;
      }
    });
    if (changed) {
      await this.writeRules(rules);
    }
  }

  async incrementUsageCounts(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const result = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
    const usage = (result[STORAGE_KEYS.USAGE] as Record<string, number> | undefined) ?? {};
    ids.forEach((id) => { usage[id] = (usage[id] ?? 0) + 1; });
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
  }

  // ----------------------------------------------------------
  // Environments
  // ----------------------------------------------------------

  async getEnvironments(): Promise<Environment[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ENVIRONMENTS);
    return (result[STORAGE_KEYS.ENVIRONMENTS] as Environment[]) || [];
  }

  async saveEnvironment(env: Environment): Promise<void> {
    await this.maybeAutoBackup();
    const envs = await this.getEnvironments();
    const idx = envs.findIndex((e) => e.id === env.id);
    if (idx >= 0) {
      envs[idx] = env;
    } else {
      envs.push({ ...env, id: env.id || crypto.randomUUID() });
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.ENVIRONMENTS]: envs });
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.maybeAutoBackup();
    let envs = await this.getEnvironments();
    const wasActive = envs.find((e) => e.id === id)?.isActive ?? false;
    envs = envs.filter((e) => e.id !== id);
    if (wasActive && envs.length > 0) {
      envs[0].isActive = true;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.ENVIRONMENTS]: envs });
  }

  async setActiveEnvironment(id: string, createBackup = true): Promise<void> {
    if (createBackup) await this.maybeAutoBackup();
    const envs = await this.getEnvironments();
    envs.forEach((e) => { e.isActive = e.id === id; });
    await chrome.storage.local.set({ [STORAGE_KEYS.ENVIRONMENTS]: envs });
  }

  async getActiveEnvironment(): Promise<Environment | null> {
    const envs = await this.getEnvironments();
    return envs.find((e) => e.isActive) ?? null;
  }

  // ----------------------------------------------------------
  // Settings
  // ----------------------------------------------------------

  async getSettings(): Promise<Settings> {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    return {
      ...DEFAULT_SETTINGS,
      ...((result[STORAGE_KEYS.SETTINGS] as Partial<Settings>) || {}),
    };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    if (settings.autoBackup) {
      const existing = await this.getAutoBackup();
      if (!existing) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.AUTO_BACKUP]: await this.exportAll(),
        });
      }
    }
  }

  // ----------------------------------------------------------
  // History
  // ----------------------------------------------------------

  async getHistory(): Promise<HistoryEntry[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    return (result[STORAGE_KEYS.HISTORY] as HistoryEntry[]) || [];
  }

  async clearHistory(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
  }

  async addHistoryEntry(entry: HistoryEntry): Promise<void> {
    const history = await this.getHistory();
    const settings = await this.getSettings();
    const updated = [entry, ...history].slice(0, settings.historyLimit);
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: updated });
  }

  // ----------------------------------------------------------
  // Import / Export
  // ----------------------------------------------------------

  async exportAll(): Promise<ExportSchema> {
    const [rulesWithUsage, environments] = await Promise.all([
      this.getRules(),
      this.getEnvironments(),
    ]);
    const rules = rulesWithUsage.map((rule) => {
      const { usageCount: _usageCount, ...exportedRule } = rule;
      return exportedRule as AnyRule;
    });
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      rules,
      environments,
    };
  }

  async importAll(data: ExportSchema, mode: 'merge' | 'replace'): Promise<void> {
    await this.maybeAutoBackup();
    const validated = asExportSchema(data);
    if (mode === 'replace') {
      await this.writeRules(validated.rules);
      await chrome.storage.local.set({
        [STORAGE_KEYS.ENVIRONMENTS]: validated.environments,
      });
    } else {
      const [existing, existingEnvs] = await Promise.all([
        this.getRules(),
        this.getEnvironments(),
      ]);
      const mergedRules = [...existing];
      validated.rules.forEach((r) => {
        if (!mergedRules.find((e) => e.id === r.id)) mergedRules.push(r);
      });
      const mergedEnvs = [...existingEnvs];
      validated.environments.forEach((e) => {
        if (!mergedEnvs.find((x) => x.id === e.id)) mergedEnvs.push(e);
      });
      await this.writeRules(mergedRules);
      await chrome.storage.local.set({
        [STORAGE_KEYS.ENVIRONMENTS]: mergedEnvs,
      });
    }
  }

  async resetToDefaults(): Promise<void> {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    await this.initEmpty();
    await chrome.storage.local.set({
      [STORAGE_KEYS.INITIALIZED]: true,
      [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    });
  }

  // ----------------------------------------------------------
  // Auto Backup
  // ----------------------------------------------------------

  private async maybeAutoBackup(): Promise<void> {
    const settings = await this.getSettings();
    if (settings.autoBackup) {
      const snapshot = await this.exportAll();
      await chrome.storage.local.set({ [STORAGE_KEYS.AUTO_BACKUP]: snapshot });
    }
  }

  async getAutoBackup(): Promise<ExportSchema | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUTO_BACKUP);
    const value = result[STORAGE_KEYS.AUTO_BACKUP];
    if (!value) return null;
    try {
      return asExportSchema(value);
    } catch {
      return null;
    }
  }

  async restoreAutoBackup(): Promise<boolean> {
    const backup = await this.getAutoBackup();
    if (!backup) return false;
    await this.writeRules(backup.rules);
    await chrome.storage.local.set({
      [STORAGE_KEYS.ENVIRONMENTS]: backup.environments,
    });
    return true;
  }
}

export const storageService = StorageService.getInstance();
