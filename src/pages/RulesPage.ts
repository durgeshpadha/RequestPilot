import type { AnyRule, RuleType, Environment } from '../models/types.js';
import { Icons } from '../utils/icons.js';
import { getRuleTypeBadgeClass, getRuleTypeLabel, debounce, escapeHtml, statusCodeLabel, statusCodeBadgeClass } from '../utils/helpers.js';
import { RuleEditor } from '../components/RuleEditor.js';
import { showConfirm } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { validateRule } from '../validation/schema.js';

interface RulesPageOptions {
  type: RuleType;
  rules: AnyRule[];
  environment: Environment | null;
  environments: Environment[];
  onSave: (rule: AnyRule) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDuplicate: (id: string) => Promise<AnyRule | null>;
  onBulkToggle: (enabled: boolean) => Promise<void>;
  onExport: () => void;
  onImport: () => void;
}

const PAGE_CONFIG: Record<RuleType, { title: string; subtitle: string; emptyTitle: string; emptyDesc: string }> = {
  header:           { title: 'Header Rules',         subtitle: 'Add, modify or remove HTTP request and response headers', emptyTitle: 'No Header Rules',         emptyDesc: 'Create your first header rule to start modifying HTTP headers.' },
  redirect:         { title: 'URL Redirect Rules',   subtitle: 'Redirect matching HTTP requests to a new URL',             emptyTitle: 'No Redirect Rules',       emptyDesc: 'Create your first redirect rule to route requests between URLs.' },
  queryParam:       { title: 'Query Param Rules',    subtitle: 'Add, modify or remove URL query parameters on requests',   emptyTitle: 'No Query Param Rules',    emptyDesc: 'Create your first rule to manipulate URL query parameters.' },
  mock:             { title: 'Mock API',             subtitle: 'Intercept requests and return synthetic responses',         emptyTitle: 'No Mock APIs',            emptyDesc: 'Create a mock API rule to simulate backend responses.' },
  responseOverride: { title: 'Response Override',    subtitle: 'Override HTTP response bodies for matched requests',        emptyTitle: 'No Response Overrides',   emptyDesc: 'Create a response override to simulate different server responses.' },
  cookie:           { title: 'Cookie Rules',         subtitle: 'Add, modify or remove cookies for matched requests',        emptyTitle: 'No Cookie Rules',         emptyDesc: 'Create a cookie rule to manage cookies for testing authenticated flows.' },
};

export function renderRulesPage(opts: RulesPageOptions): { el: HTMLElement; wireHeaderButtons: (container: HTMLElement) => void } {
  const el = document.createElement('div');
  el.className = 'fade-in';
  el.innerHTML = buildPageContent(opts);
  const openEditor = attachEvents(el, opts);

  // Build header buttons as real DOM elements so we can wire them immediately
  const wireHeaderButtons = (container: HTMLElement) => {
    container.innerHTML = '';

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary btn-sm';
    importBtn.id = 'page-import-btn';
    importBtn.innerHTML = `${Icons.upload({ size: 14 })} Import`;
    importBtn.addEventListener('click', opts.onImport);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary btn-sm';
    exportBtn.id = 'page-export-btn';
    exportBtn.innerHTML = `${Icons.download({ size: 14 })} Export`;
    exportBtn.addEventListener('click', opts.onExport);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.id = 'page-add-btn';
    addBtn.innerHTML = `${Icons.plus({ size: 14 })} Add Rule`;
    addBtn.addEventListener('click', () => openEditor());

    container.appendChild(importBtn);
    container.appendChild(exportBtn);
    container.appendChild(addBtn);
  };

  return { el, wireHeaderButtons };
}

function buildPageContent(opts: RulesPageOptions): string {
  const { rules, type } = opts;
  const filtered = rules.filter((r) => r.type === type);

  return `
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="input-with-icon" style="flex:1;max-width:340px">
          <span class="input-icon">${Icons.search({ size: 15 })}</span>
          <input class="input" type="search" id="search-input" placeholder="Search rules..." autocomplete="off"/>
        </div>
        <select class="select" id="filter-status" style="width:140px">
          <option value="">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        ${type === 'header' ? `
          <select class="select" id="filter-target" style="width:130px">
            <option value="">All Targets</option>
            <option value="request">Request</option>
            <option value="response">Response</option>
          </select>` : ''}
      </div>
      <div class="toolbar-right">
        <button class="btn btn-ghost btn-sm" id="bulk-enable">Enable All</button>
        <button class="btn btn-ghost btn-sm" id="bulk-disable">Disable All</button>
        <select class="select" id="sort-select" style="width:160px">
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="priority-asc">Priority ↑</option>
          <option value="priority-desc">Priority ↓</option>
          <option value="date-new">Newest First</option>
          <option value="date-old">Oldest First</option>
        </select>
      </div>
    </div>

    <!-- Rules List -->
    <div id="rules-list">${filtered.length ? renderRuleCards(filtered, type, opts.environments) : renderEmptyState(type, false)}</div>
  `;
}

function renderRuleCards(rules: AnyRule[], type: RuleType, environments: Environment[]): string {
  return `<div style="display:flex;flex-direction:column;gap:var(--space-3)">${rules.map((r) => renderRuleCard(r, type, environments)).join('')}</div>`;
}

function renderRuleCard(r: AnyRule, _type: RuleType, environments: Environment[]): string {
  const meta = getRuleMeta(r);
  const validation = validateRule(r);
  return `
    <div class="rule-card ${r.enabled ? '' : 'disabled'}" data-rule-id="${escapeHtml(r.id)}">
      <div class="rule-card-left">
        <label class="toggle" title="${r.enabled ? 'Disable rule' : 'Enable rule'}">
          <input type="checkbox" class="rule-toggle" data-id="${escapeHtml(r.id)}" ${r.enabled ? 'checked' : ''}/>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
      <div class="rule-card-body">
        <div class="rule-card-name">${escapeHtml(r.name)}</div>
        <div class="rule-card-meta">
          <span class="badge ${getRuleTypeBadgeClass(r.type)}">${getRuleTypeLabel(r.type)}</span>
          <span class="badge ${validation.valid ? 'badge-green' : 'badge-red'}" title="${escapeHtml(validation.errors.join(' '))}">
            ${validation.valid ? 'Valid' : 'Invalid'}
          </span>
          ${meta.badges}
          ${r.group ? `<span class="badge badge-gray">${escapeHtml(r.group)}</span>` : ''}
          ${(r.tags ?? []).map((tag) => `<span class="badge badge-gray">#${escapeHtml(tag)}</span>`).join('')}
          ${r.environmentIds?.length
            ? `<span class="badge badge-gray">${escapeHtml(
                r.environmentIds
                  .map((id) => environments.find((environment) => environment.id === id)?.name ?? id)
                  .join(' / ')
              )}</span>`
            : '<span class="badge badge-gray">All environments</span>'}
          <span style="font-size:var(--text-xs);color:var(--color-text-tertiary)">Priority ${r.priority}</span>
        </div>
        <div class="rule-card-url">${Icons.globe({ size: 11 })} <span>${escapeHtml((r as { urlMatcher?: { pattern?: string } }).urlMatcher?.pattern ?? '')}</span></div>
        ${meta.detail ? `<div class="rule-card-detail">${meta.detail}</div>` : ''}
      </div>
      <div class="rule-card-actions">
        <button class="btn btn-ghost btn-icon btn-sm rule-edit" data-id="${escapeHtml(r.id)}" aria-label="Edit rule" data-tooltip="Edit">
          ${Icons.edit({ size: 14 })}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm rule-dup" data-id="${escapeHtml(r.id)}" aria-label="Duplicate rule" data-tooltip="Duplicate">
          ${Icons.copy({ size: 14 })}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm rule-del" data-id="${escapeHtml(r.id)}" aria-label="Delete rule" data-tooltip="Delete" style="color:var(--color-error)">
          ${Icons.trash({ size: 14 })}
        </button>
      </div>
    </div>`;
}

function getRuleMeta(r: AnyRule): { badges: string; detail: string } {
  let badges = '';
  let detail = '';
  if (r.type === 'header') {
    const hr = r;
    badges = `<span class="badge ${hr.target === 'request' ? 'badge-blue' : 'badge-purple'}">${hr.target}</span>`;
    detail = hr.headers.map((h) => `<span style="font-family:var(--font-mono)">${h.operation} ${escapeHtml(h.name)}${h.value ? ': ' + escapeHtml(h.value) : ''}</span>`).join(' · ');
  } else if (r.type === 'redirect') {
    detail = `→ ${escapeHtml(r.redirectUrl)}`;
  } else if (r.type === 'mock') {
    badges = `<span class="badge ${statusCodeBadgeClass(r.statusCode)}">${statusCodeLabel(r.statusCode)}</span>`;
    detail = `Delay: ${r.delay}ms`;
  } else if (r.type === 'responseOverride') {
    if (r.statusCode) badges = `<span class="badge ${statusCodeBadgeClass(r.statusCode)}">${statusCodeLabel(r.statusCode)}</span>`;
  } else if (r.type === 'queryParam') {
    detail = r.params.map((p) => `${p.operation} ${escapeHtml(p.key)}${p.value ? '=' + escapeHtml(p.value) : ''}`).join(' · ');
  } else if (r.type === 'cookie') {
    detail = r.cookies.map((c) => `${c.operation} ${escapeHtml(c.name)}`).join(' · ');
  }
  return { badges, detail };
}

function renderEmptyState(type: RuleType, isSearch: boolean): string {
  if (isSearch) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${Icons.search({ size: 28 })}</div>
        <h3 class="empty-state-title">No matching rules</h3>
        <p class="empty-state-desc">Try adjusting your search or filters.</p>
        <button class="btn btn-ghost" id="clear-filters-btn">${Icons.close({ size: 14 })} Clear Filters</button>
      </div>`;
  }
  const c = PAGE_CONFIG[type];
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${Icons.package({ size: 28 })}</div>
      <h3 class="empty-state-title">${c.emptyTitle}</h3>
      <p class="empty-state-desc">${c.emptyDesc}</p>
      <button class="btn btn-primary" id="empty-add-btn">${Icons.plus({ size: 16 })} Add ${c.title.replace('Rules', 'Rule').replace('Mock API', 'Mock API Rule')}</button>
    </div>`;
}

function attachEvents(el: HTMLElement, opts: RulesPageOptions): (rule?: AnyRule) => void {
  let currentRules = opts.rules.filter((r) => r.type === opts.type);

  const rerender = () => {
    const search = (el.querySelector('#search-input') as HTMLInputElement)?.value?.toLowerCase() ?? '';
    const statusFilter = (el.querySelector('#filter-status') as HTMLSelectElement)?.value ?? '';
    const targetFilter = (el.querySelector('#filter-target') as HTMLSelectElement)?.value ?? '';
    const sort = (el.querySelector('#sort-select') as HTMLSelectElement)?.value ?? 'name-asc';

    let filtered = currentRules;
    if (search) filtered = filtered.filter((r) =>
      r.name.toLowerCase().includes(search) ||
      (r as { urlMatcher?: { pattern?: string } }).urlMatcher?.pattern?.toLowerCase().includes(search) ||
      r.group?.toLowerCase().includes(search) ||
      r.tags?.some((tag) => tag.toLowerCase().includes(search))
    );
    if (statusFilter === 'enabled') filtered = filtered.filter((r) => r.enabled);
    if (statusFilter === 'disabled') filtered = filtered.filter((r) => !r.enabled);
    if (targetFilter) filtered = filtered.filter((r) => r.type === 'header' && r.target === targetFilter);

    filtered = [...filtered].sort((a, b) => {
      if (sort === 'name-asc')      return a.name.localeCompare(b.name);
      if (sort === 'name-desc')     return b.name.localeCompare(a.name);
      if (sort === 'priority-asc')  return a.priority - b.priority;
      if (sort === 'priority-desc') return b.priority - a.priority;
      if (sort === 'date-new')      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'date-old')      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return 0;
    });

    const list = el.querySelector('#rules-list');
    if (list) {
      list.innerHTML = filtered.length ? renderRuleCards(filtered, opts.type, opts.environments) : renderEmptyState(opts.type, !!(search || statusFilter || targetFilter));
      attachListEvents(el, opts, rerender, currentRules);
    }
  };

  const openEditor = (rule?: AnyRule) => {
    const editor = new RuleEditor({
      rule,
      type: opts.type,
      environment: opts.environment,
      environments: opts.environments,
      onSave: async (saved) => {
        await opts.onSave(saved);
        const idx = currentRules.findIndex((r) => r.id === saved.id);
        if (idx >= 0) currentRules[idx] = saved;
        else currentRules.push(saved);
        rerender();
      },
    });
    editor.open();
  };

  el.querySelector('#search-input')?.addEventListener('input', debounce(rerender, 200) as EventListener);
  el.querySelector('#filter-status')?.addEventListener('change', rerender);
  el.querySelector('#filter-target')?.addEventListener('change', rerender);
  el.querySelector('#sort-select')?.addEventListener('change', rerender);
  el.querySelector('#bulk-enable')?.addEventListener('click', async () => {
    await opts.onBulkToggle(true);
    currentRules.forEach((rule) => { rule.enabled = true; });
    toast.success('All rules on this page enabled');
    rerender();
  });
  el.querySelector('#bulk-disable')?.addEventListener('click', async () => {
    await opts.onBulkToggle(false);
    currentRules.forEach((rule) => { rule.enabled = false; });
    toast.success('All rules on this page disabled');
    rerender();
  });

  // Header buttons are wired by the caller via wireHeaderButtons()

  attachListEvents(el, opts, rerender, currentRules);

  // Store openEditor on element for empty-state button access
  (el as HTMLElement & { openEditor?: (r?: AnyRule) => void }).openEditor = openEditor;

  return openEditor;
}

function attachListEvents(el: HTMLElement, opts: RulesPageOptions, rerender: () => void, currentRules: AnyRule[]): void {
  el.querySelector('#empty-add-btn')?.addEventListener('click', () => {
    (el as HTMLElement & { openEditor?: () => void }).openEditor?.();
  });

  el.querySelector('#clear-filters-btn')?.addEventListener('click', () => {
    (el.querySelector('#search-input') as HTMLInputElement).value = '';
    (el.querySelector('#filter-status') as HTMLSelectElement).value = '';
    rerender();
  });

  el.querySelectorAll('.rule-toggle').forEach((tog) => {
    tog.addEventListener('change', async () => {
      const id = (tog as HTMLInputElement).dataset.id!;
      const enabled = (tog as HTMLInputElement).checked;
      try {
        await opts.onToggle(id, enabled);
        const rule = currentRules.find((r) => r.id === id);
        if (rule) rule.enabled = enabled;
        const card = el.querySelector(`[data-rule-id="${id}"]`);
        card?.classList.toggle('disabled', !enabled);
      } catch (error) {
        (tog as HTMLInputElement).checked = !enabled;
        toast.error('Rule state was not changed', String(error));
      }
    });
  });

  el.querySelectorAll('.rule-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const rule = currentRules.find((r) => r.id === id);
      if (rule) (el as HTMLElement & { openEditor?: (r: AnyRule) => void }).openEditor?.(rule);
    });
  });

  el.querySelectorAll('.rule-dup').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const copy = await opts.onDuplicate((btn as HTMLElement).dataset.id!);
        if (copy) {
          currentRules.push(copy);
          toast.success('Rule duplicated');
          rerender();
        }
      } catch (error) {
        toast.error('Rule could not be duplicated', String(error));
      }
    });
  });

  el.querySelectorAll('.rule-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      const rule = currentRules.find((r) => r.id === id);
      const confirmed = await showConfirm({
        title: 'Delete Rule',
        body: `Are you sure you want to delete "${rule?.name ?? 'this rule'}"? This action cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (confirmed) {
        await opts.onDelete(id);
        const idx = currentRules.findIndex((r) => r.id === id);
        if (idx >= 0) currentRules.splice(idx, 1);
        toast.success('Rule deleted');
        rerender();
      }
    });
  });
}
