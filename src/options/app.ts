import type { AnyRule, RuleType, Environment, Settings } from '../models/types.js';
import { DEFAULT_SETTINGS, storageService } from '../storage/StorageService.js';
import { Icons } from '../utils/icons.js';
import { applyTheme } from '../utils/helpers.js';
import { renderDashboard } from '../pages/DashboardPage.js';
import { renderRulesPage } from '../pages/RulesPage.js';
import { renderEnvironmentsPage } from '../pages/EnvironmentsPage.js';
import { renderHistoryPage } from '../pages/HistoryPage.js';
import { renderImportExportPage } from '../pages/ImportExportPage.js';
import { renderSettingsPage } from '../pages/SettingsPage.js';
import { renderHowToUsePage } from '../pages/HowToUsePage.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { toast } from '../components/Toast.js';
import type { HistoryEntry } from '../models/types.js';

type PageId =
  | 'dashboard'
  | 'header-rules' | 'redirect-rules' | 'query-param-rules'
  | 'mock-api' | 'response-override' | 'cookie-rules'
  | 'environments' | 'history' | 'import-export' | 'settings' | 'how-to-use';

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: string; section?: string }> = [
  { id: 'dashboard',         label: 'Dashboard',          icon: Icons.dashboard(),    section: 'OVERVIEW' },
  { id: 'header-rules',      label: 'Header Rules',       icon: Icons.headers(),      section: 'RULES' },
  { id: 'redirect-rules',    label: 'URL Redirect',       icon: Icons.redirect() },
  { id: 'query-param-rules', label: 'Query Parameters',   icon: Icons.queryParam() },
  { id: 'mock-api',          label: 'Mock API',           icon: Icons.mock() },
  { id: 'response-override', label: 'Response Override',  icon: Icons.responseOverride() },
  { id: 'cookie-rules',      label: 'Cookies',            icon: Icons.cookies() },
  { id: 'environments',      label: 'Environments',       icon: Icons.environment(),  section: 'CONFIG' },
  { id: 'history',           label: 'History',            icon: Icons.history() },
  { id: 'import-export',     label: 'Import / Export',    icon: Icons.importExport() },
  { id: 'settings',          label: 'Settings',           icon: Icons.settings() },
  { id: 'how-to-use',        label: 'How To Use',         icon: Icons.info(),         section: 'HELP' },
];

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  'dashboard':         { title: 'Dashboard',            subtitle: 'Overview of your rules and recent activity' },
  'header-rules':      { title: 'Header Rules',         subtitle: 'Modify HTTP request and response headers' },
  'redirect-rules':    { title: 'URL Redirect Rules',   subtitle: 'Redirect matching requests to new URLs' },
  'query-param-rules': { title: 'Query Param Rules',    subtitle: 'Add, modify or remove URL query parameters' },
  'mock-api':          { title: 'Mock API',             subtitle: 'Intercept requests with synthetic responses' },
  'response-override': { title: 'Response Override',    subtitle: 'Override HTTP response bodies' },
  'cookie-rules':      { title: 'Cookie Rules',         subtitle: 'Manage cookies for matched requests' },
  'environments':      { title: 'Environments',         subtitle: 'Manage variable sets for rule placeholders' },
  'history':           { title: 'History',              subtitle: 'Log of HTTP modifications applied by rules' },
  'import-export':     { title: 'Import / Export',      subtitle: 'Backup, share, and restore your configuration' },
  'settings':          { title: 'Settings',             subtitle: 'Customize the extension appearance and behavior' },
  'how-to-use':        { title: 'How To Use',           subtitle: 'Guide, examples, and working expectations for every feature' },
};

const PAGE_RULE_TYPE: Partial<Record<PageId, RuleType>> = {
  'header-rules': 'header', 'redirect-rules': 'redirect',
  'query-param-rules': 'queryParam', 'mock-api': 'mock',
  'response-override': 'responseOverride', 'cookie-rules': 'cookie',
};

// ============================================================
// App State
// ============================================================

let rules: AnyRule[] = [];
let environments: Environment[] = [];
let settings: Settings = { ...DEFAULT_SETTINGS };
let history: HistoryEntry[] = [];
let hasAutoBackup = false;
let currentPage: PageId = 'dashboard';
let sidebarCollapsed = false;
let manifestVersion = '1.0.0';

const palette = new CommandPalette();

async function syncAndReport(): Promise<void> {
  const result = await chrome.runtime.sendMessage({ type: 'SYNC_RULES' }) as {
    ok?: boolean;
    errors?: string[];
  };
  if (result?.errors?.length) {
    toast.warning('Some rules could not be activated', result.errors[0]);
  }
}

// ============================================================
// DOM References
// ============================================================

const sidebar = document.getElementById('sidebar')!;
const mainContent = document.getElementById('main-content')!;
const pageTitle = document.getElementById('page-title')!;
const pageSubtitle = document.getElementById('page-subtitle')!;
const pageActions = document.getElementById('page-header-actions')!;

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap(): Promise<void> {
  try {
    await storageService.initialize();
    const loaded = await Promise.all([
      storageService.getRules(),
      storageService.getEnvironments(),
      storageService.getSettings(),
      storageService.getHistory(),
      storageService.getAutoBackup(),
    ]);
    [rules, environments, settings, history] = loaded.slice(0, 4) as [
      AnyRule[], Environment[], Settings, HistoryEntry[]
    ];
    hasAutoBackup = loaded[4] !== null;

    try {
      const manifest = chrome.runtime.getManifest();
      manifestVersion = manifest.version;
    } catch { /* non-extension context */ }

    applyTheme(settings.theme);
    buildSidebar();
    setupGlobalShortcuts();
    setupCommandPalette();
    setupStorageUpdates();
    navigateTo('dashboard');
  } catch (err) {
    console.error('RequestPilot bootstrap error:', err);
    toast.error('Initialization Error', String(err));
  }
}

// ============================================================
// Sidebar
// ============================================================

function buildSidebar(): void {
  const nav = document.getElementById('sidebar-nav')!;
  let lastSection = '';
  let html = '';

  NAV_ITEMS.forEach((item) => {
    if (item.section && item.section !== lastSection) {
      html += `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section!;
    }
    html += `
      <button class="nav-item ${currentPage === item.id ? 'active' : ''}" data-page="${item.id}" aria-label="${item.label}">
        <span class="nav-item-icon">${item.icon}</span>
        <span class="nav-item-label">${item.label}</span>
      </button>`;
  });

  nav.innerHTML = html;
  nav.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo((btn as HTMLElement).dataset.page as PageId));
  });

  // Collapse toggle
  const footer = document.getElementById('sidebar-footer')!;
  footer.innerHTML = `
    <button class="btn btn-ghost" id="sidebar-collapse-btn" aria-label="Toggle sidebar" style="width:100%;color:var(--color-sidebar-text);justify-content:${sidebarCollapsed ? 'center' : 'flex-start'}">
      ${sidebarCollapsed ? Icons.chevronRight({ size: 16 }) : Icons.chevronLeft({ size: 16 })}
      <span class="nav-item-label" style="font-size:var(--text-xs)">Collapse</span>
    </button>`;

  footer.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    buildSidebar();
  });
}

function updateNavActive(): void {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.page === currentPage);
  });
}

// ============================================================
// Navigation
// ============================================================

function navigateTo(pageId: PageId): void {
  currentPage = pageId;
  updateNavActive();

  const info = PAGE_TITLES[pageId];
  pageTitle.textContent = info.title;
  pageSubtitle.textContent = info.subtitle;
  pageActions.innerHTML = '';

  mainContent.innerHTML = '';
  const page = buildPage(pageId);
  mainContent.appendChild(page);

}

// ============================================================
// Page Builder
// ============================================================

function buildPage(pageId: PageId): HTMLElement {
  const activeEnv = environments.find((e) => e.isActive) ?? null;

  if (pageId === 'dashboard') {
    return renderDashboard(rules, history, (page, createNew) => {
      navigateTo(page as PageId);
      if (createNew) setTimeout(() => document.getElementById('page-add-btn')?.click(), 0);
    });
  }

  if (pageId === 'environments') {
    return renderEnvironmentsPage({
      environments,
      onSave: async (env) => {
        await storageService.saveEnvironment(env);
        environments = await storageService.getEnvironments();
      },
      onDelete: async (id) => {
        await storageService.deleteEnvironment(id);
        environments = await storageService.getEnvironments();
      },
      onSetActive: async (id) => {
        await storageService.setActiveEnvironment(id);
        environments = await storageService.getEnvironments();
      },
    });
  }

  if (pageId === 'history') {
    return renderHistoryPage({
      history,
      onClear: async () => {
        await storageService.clearHistory();
        history = [];
      },
    });
  }

  if (pageId === 'import-export') {
    return renderImportExportPage({
      onExport: () => storageService.exportAll(),
      onImport: async (data, mode) => {
        await storageService.importAll(data, mode);
        rules = await storageService.getRules();
        environments = await storageService.getEnvironments();
        await syncAndReport();
      },
    });
  }

  if (pageId === 'settings') {
    return renderSettingsPage({
      settings,
      environments,
      version: manifestVersion,
      hasAutoBackup,
      onSave: async (s) => {
        settings = s;
        await storageService.saveSettings(s);
        applyTheme(s.theme);
      },
      onReset: async () => {
        await storageService.resetToDefaults();
      },
      onRestore: async () => {
        const restored = await storageService.restoreAutoBackup();
        if (!restored) throw new Error('No valid auto-backup is available.');
        [rules, environments] = await Promise.all([
          storageService.getRules(),
          storageService.getEnvironments(),
        ]);
      },
    });
  }

  if (pageId === 'how-to-use') {
    return renderHowToUsePage();
  }

  // Rule pages
  const ruleType = PAGE_RULE_TYPE[pageId];
  if (ruleType) {
    const { el, wireHeaderButtons } = renderRulesPage({
      type: ruleType,
      rules,
      environment: activeEnv,
      environments,
      onSave: async (rule) => {
        await storageService.saveRule(rule);
        rules = await storageService.getRules();
        await syncAndReport();
      },
      onDelete: async (id) => {
        await storageService.deleteRule(id);
        rules = rules.filter((r) => r.id !== id);
        await syncAndReport();
      },
      onToggle: async (id, enabled) => {
        await storageService.toggleRule(id, enabled);
        await syncAndReport();
      },
      onDuplicate: async (id) => {
        const copy = await storageService.duplicateRule(id);
        if (copy) rules.push(copy);
        return copy;
      },
      onBulkToggle: async (enabled) => {
        await storageService.toggleRulesByType(ruleType, enabled);
        rules = await storageService.getRules();
        await syncAndReport();
      },
      onExport: async () => {
        const { downloadJson } = await import('../utils/helpers.js');
        const typeRules = rules.filter((r) => r.type === ruleType);
        downloadJson(
          { version: '1.0.0', exportedAt: new Date().toISOString(), rules: typeRules, environments: [] },
          `requestpilot-${ruleType}-rules-${new Date().toISOString().slice(0, 10)}.json`
        );
        toast.success('Export complete', `${typeRules.length} rules exported`);
      },
      onImport: () => {
        navigateTo('import-export');
      },
    });

    // Wire header buttons now that pageActions is in the DOM
    wireHeaderButtons(pageActions);

    return el;
  }

  const fallback = document.createElement('div');
  fallback.className = 'empty-state fade-in';
  fallback.innerHTML = `<p style="color:var(--color-text-secondary)">Page not found</p>`;
  return fallback;
}

// ============================================================
// Keyboard Shortcuts
// ============================================================

function setupGlobalShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && PAGE_RULE_TYPE[currentPage]) {
      e.preventDefault();
      document.getElementById('page-add-btn')?.click();
    }
  });
}

function setupStorageUpdates(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.requestpilot_history) {
      history = (changes.requestpilot_history.newValue as HistoryEntry[] | undefined) ?? [];
      if (currentPage === 'history' || currentPage === 'dashboard') navigateTo(currentPage);
    }
    if (area === 'local' && changes.requestpilot_rules) {
      void storageService.getRules().then((updatedRules) => {
        rules = updatedRules;
        if (currentPage === 'dashboard') navigateTo('dashboard');
      });
    }
    if (area === 'local' && changes.requestpilot_usage) {
      void storageService.getRules().then((updatedRules) => {
        rules = updatedRules;
        if (currentPage === 'dashboard') navigateTo('dashboard');
      });
    }
  });
}

// ============================================================
// Command Palette Setup
// ============================================================

function setupCommandPalette(): void {
  palette.setCommands([
    { id: 'dashboard',    label: 'Go to Dashboard',           icon: Icons.dashboard(),    action: () => navigateTo('dashboard') },
    { id: 'header-rules', label: 'Go to Header Rules',        icon: Icons.headers(),      kbd: 'Ctrl+K', action: () => navigateTo('header-rules') },
    { id: 'redirect',     label: 'Go to URL Redirect Rules',  icon: Icons.redirect(),     action: () => navigateTo('redirect-rules') },
    { id: 'qp',           label: 'Go to Query Param Rules',   icon: Icons.queryParam(),   action: () => navigateTo('query-param-rules') },
    { id: 'mock',         label: 'Go to Mock API',            icon: Icons.mock(),         action: () => navigateTo('mock-api') },
    { id: 'resp',         label: 'Go to Response Override',   icon: Icons.responseOverride(), action: () => navigateTo('response-override') },
    { id: 'cookies',      label: 'Go to Cookie Rules',        icon: Icons.cookies(),      action: () => navigateTo('cookie-rules') },
    { id: 'envs',         label: 'Go to Environments',        icon: Icons.environment(),  action: () => navigateTo('environments') },
    { id: 'history',      label: 'Go to History',             icon: Icons.history(),      action: () => navigateTo('history') },
    { id: 'import',       label: 'Go to Import / Export',     icon: Icons.importExport(), action: () => navigateTo('import-export') },
    { id: 'settings',     label: 'Go to Settings',            icon: Icons.settings(),     action: () => navigateTo('settings') },
    { id: 'how-to-use',  label: 'How To Use — Help Guide',   icon: Icons.info(),         action: () => navigateTo('how-to-use') },
    {
      id: 'new-header', label: 'New Header Rule',            icon: Icons.plus(),
      action: () => { navigateTo('header-rules'); setTimeout(() => document.getElementById('page-add-btn')?.click(), 100); }
    },
    {
      id: 'new-redirect', label: 'New Redirect Rule',        icon: Icons.plus(),
      action: () => { navigateTo('redirect-rules'); setTimeout(() => document.getElementById('page-add-btn')?.click(), 100); }
    },
    {
      id: 'new-mock', label: 'New Mock API Rule',            icon: Icons.plus(),
      action: () => { navigateTo('mock-api'); setTimeout(() => document.getElementById('page-add-btn')?.click(), 100); }
    },
    {
      id: 'export-all', label: 'Export All Rules',           icon: Icons.download(),
      action: () => navigateTo('import-export')
    },
  ]);
}

// ============================================================
// Auto-start when loaded as a module script from options.html
// ============================================================
bootstrap();
