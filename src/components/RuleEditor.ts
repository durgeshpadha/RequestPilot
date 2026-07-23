import type { AnyRule, HeaderRule, RedirectRule, QueryParamRule, MockApiRule, CookieRule, HeaderOperation, QueryParamOperation, CookieOperation, RuleType, Environment } from '../models/types.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml, generateId, resolveVariables, findUnresolvedVariables, COMMON_HEADERS } from '../utils/helpers.js';
import { matchesUrlPattern, ruleAppliesToEnvironment } from '../utils/ruleMatcher.js';
import { validateRule } from '../validation/schema.js';
import { toast } from './Toast.js';
import { showConfirm } from './Modal.js';

type SaveCallback = (rule: AnyRule) => Promise<void>;

interface EditorOptions {
  rule?: AnyRule;
  type?: RuleType;
  environment: Environment | null;
  environments: Environment[];
  onSave: SaveCallback;
}

// ============================================================
// Rule Editor Drawer
// ============================================================

export class RuleEditor {
  private overlay: HTMLElement;
  private drawer: HTMLElement;
  private options: EditorOptions;
  private headerOps: HeaderOperation[] = [];
  private queryOps: QueryParamOperation[] = [];
  private cookieOps: CookieOperation[] = [];
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private previousFocus: HTMLElement | null = null;
  private closing = false;
  private dirty = false;
  private confirmingClose = false;

  constructor(options: EditorOptions) {
    this.options = options;
    this.overlay = document.createElement('div');
    this.overlay.className = 'drawer-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'rule-editor-title');
    this.drawer = document.createElement('div');
    this.drawer.className = 'drawer';
    this.overlay.appendChild(this.drawer);
    document.body.appendChild(this.overlay);
  }

  open(): void {
    const { rule, type, environment } = this.options;
    const ruleType = rule?.type || type || 'header';
    const isEdit = !!rule;

    this.previousFocus = document.activeElement as HTMLElement | null;
    if (rule?.type === 'header') this.headerOps = (rule as HeaderRule).headers.map((item) => ({ ...item }));
    else if (rule?.type === 'mock') this.headerOps = (rule as MockApiRule).responseHeaders.map((item) => ({ ...item }));
    else if (rule?.type === 'queryParam') this.queryOps = (rule as QueryParamRule).params.map((item) => ({ ...item }));
    else if (rule?.type === 'cookie') this.cookieOps = (rule as CookieRule).cookies.map((item) => ({ ...item }));
    else if (ruleType === 'header') this.headerOps = [{ name: '', value: '', operation: 'set' }];
    else if (ruleType === 'queryParam') this.queryOps = [{ key: '', value: '', operation: 'set' }];
    else if (ruleType === 'cookie') this.cookieOps = [{ name: '', value: '', operation: 'set' }];

    this.drawer.innerHTML = this.buildHtml(ruleType, rule, environment);
    this.attachEvents(ruleType, isEdit);
    this.drawer.addEventListener('input', () => { this.dirty = true; });
    this.drawer.addEventListener('change', () => { this.dirty = true; });

    requestAnimationFrame(() => {
      this.overlay.classList.add('open');
      this.drawer.classList.add('open');
    });

    const firstInput = this.drawer.querySelector<HTMLInputElement>('.input, .textarea, .select');
    setTimeout(() => firstInput?.focus(), 300);
  }

  close(force = false): void {
    if (!force && this.dirty) {
      if (this.confirmingClose) return;
      this.confirmingClose = true;
      void showConfirm({
        title: 'Discard Unsaved Changes?',
        body: 'Changes made in this rule editor have not been saved.',
        confirmLabel: 'Discard',
        variant: 'danger',
      }).then((confirmed) => {
        this.confirmingClose = false;
        if (confirmed) this.close(true);
      });
      return;
    }
    if (this.closing) return;
    this.closing = true;
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    this.overlay.classList.remove('open');
    this.drawer.classList.remove('open');
    setTimeout(() => {
      this.overlay.remove();
      this.previousFocus?.focus();
    }, 300);
  }

  private buildHtml(type: RuleType, rule: AnyRule | undefined, env: Environment | null): string {
    const r = rule;
    const name = escapeHtml(r?.name ?? '');
    const enabled = r?.enabled ?? true;
    const desc = escapeHtml(r?.description ?? '');
    const group = escapeHtml(r?.group ?? '');
    const tags = escapeHtml(r?.tags?.join(', ') ?? '');
    const priority = r?.priority ?? 1;
    const appliesEverywhere = !r?.environmentIds?.length;
    const urlPattern = (r as HeaderRule)?.urlMatcher?.pattern ?? '';
    const escapedUrlPattern = escapeHtml(urlPattern);
    const isRegex = (r as HeaderRule)?.urlMatcher?.isRegex ?? false;
    const typeLabel: Record<RuleType, string> = {
      header: 'Header Rule', redirect: 'Redirect Rule', queryParam: 'Query Param Rule',
      mock: 'Mock API Rule', responseOverride: 'Response Override', cookie: 'Cookie Rule',
    };

    const urlHint = env && urlPattern.includes('{{')
      ? `<div class="input-hint" style="color:var(--color-primary)">Preview: ${escapeHtml(resolveVariables(urlPattern, env))}</div>`
      : '';
    const unresolvedVars = findUnresolvedVariables(urlPattern, env);
    const varWarning = unresolvedVars.length
      ? `<div class="input-hint" style="color:var(--color-warning)">${Icons.alertTriangle({ size: 12 })} Unresolved: ${unresolvedVars.map(escapeHtml).join(', ')}</div>`
      : '';

    return `
      <div class="drawer-header">
        <h2 class="drawer-title" id="rule-editor-title">${r ? 'Edit' : 'New'} ${typeLabel[type]}</h2>
        <button class="btn btn-ghost btn-icon" id="drawer-close" aria-label="Close">${Icons.close({ size: 18 })}</button>
      </div>
      <div class="drawer-body">
        <div class="form-section">
          <div class="form-row">
            <div class="input-group">
              <label class="input-label" for="rule-name">Rule Name <span class="required">*</span></label>
              <input id="rule-name" class="input" type="text" placeholder="e.g. Add Auth Header" value="${name}" autocomplete="off"/>
              <span class="input-error-msg" id="err-name" style="display:none">${Icons.alertTriangle({ size: 12 })} Required</span>
            </div>
            <div class="input-group">
              <label class="input-label" for="rule-priority">Priority</label>
              <input id="rule-priority" class="input" type="number" min="1" max="999" value="${priority}"/>
            </div>
          </div>
          <div class="input-group">
            <label class="toggle-wrapper" for="rule-enabled">
              <div class="toggle">
                <input type="checkbox" id="rule-enabled" ${enabled ? 'checked' : ''}/>
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </div>
              <span>Rule Enabled</span>
            </label>
          </div>
          <div class="input-group">
            <label class="input-label">Applies to environments</label>
            <div class="filter-chip-grid">
              <label class="filter-chip">
                <input type="checkbox" id="rule-env-all" ${appliesEverywhere ? 'checked' : ''}/>
                <span>All environments</span>
              </label>
              ${this.options.environments.map((environment) => `
                <label class="filter-chip">
                  <input type="checkbox" name="rule-environment" value="${escapeHtml(environment.id)}"
                    ${r?.environmentIds?.includes(environment.id) ? 'checked' : ''}/>
                  <span>${escapeHtml(environment.name)}</span>
                </label>`).join('')}
            </div>
            <div class="input-hint">Choose specific environments, or leave “All environments” selected.</div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">URL Matching</div>
          <div class="input-group">
            <label class="input-label" for="rule-url">Match URL <span class="required">*</span></label>
            <input id="rule-url" class="input" type="text" placeholder="https://api.example.com/* or {{BASE_URL}}/*" value="${escapedUrlPattern}"/>
            ${urlHint}${varWarning}
            <span class="input-error-msg" id="err-url" style="display:none">${Icons.alertTriangle({ size: 12 })} Required</span>
          </div>
          <label class="checkbox-wrapper">
            <input type="checkbox" id="rule-regex" ${isRegex ? 'checked' : ''}/>
            Use Regular Expression
          </label>
          ${this.buildRequestFilters(rule, type)}
          <div class="test-rule-panel">
            <div class="input-group">
              <label class="input-label" for="rule-test-url">Test this matcher</label>
              <div style="display:flex;gap:var(--space-2)">
                <input id="rule-test-url" class="input" type="url" placeholder="https://api.example.com/users" />
                <select id="rule-test-method" class="select" style="width:100px">
                  ${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => `<option>${method}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-secondary" id="btn-test-rule">Test</button>
              </div>
              <div class="input-hint" id="rule-test-result">Enter a URL to preview whether this rule matches.</div>
            </div>
          </div>
          ${this.buildTypeSpecificFields(type, rule)}
        </div>
        <div class="form-section">
          <div class="form-row">
            <div class="input-group">
              <label class="input-label" for="rule-group">Group</label>
              <input id="rule-group" class="input" type="text" maxlength="60" placeholder="e.g. Checkout API" value="${group}"/>
            </div>
            <div class="input-group">
              <label class="input-label" for="rule-tags">Tags</label>
              <input id="rule-tags" class="input" type="text" maxlength="160" placeholder="auth, staging, team-a" value="${tags}"/>
            </div>
          </div>
          <div class="input-group">
            <label class="input-label" for="rule-desc">Description</label>
            <textarea id="rule-desc" class="textarea" placeholder="Optional notes..." style="min-height:70px">${desc}</textarea>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
        <button class="btn btn-secondary" id="btn-save-dup">${Icons.copy({ size: 14 })} Save & Duplicate</button>
        <button class="btn btn-primary" id="btn-save">${Icons.save({ size: 14 })} Save</button>
      </div>
    `;
  }

  private buildRequestFilters(rule: AnyRule | undefined, type: RuleType): string {
    const isPageInterceptor = type === 'mock' || type === 'responseOverride';
    const methods = rule?.urlMatcher.httpMethods ?? ['*'];
    const resources = rule?.urlMatcher.resourceTypes ??
      (isPageInterceptor ? ['xmlhttprequest'] : ['*']);
    const methodOptions = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const allResourceOptions = [
      ['*', 'All'],
      ['xmlhttprequest', 'Fetch / XHR'],
      ['document', 'Documents'],
      ['script', 'Scripts'],
      ['stylesheet', 'Styles'],
      ['image', 'Images'],
      ['font', 'Fonts'],
      ['media', 'Media'],
      ['websocket', 'WebSocket'],
      ['other', 'Other'],
    ];
    const resourceOptions =
      isPageInterceptor
        ? [['xmlhttprequest', 'Fetch / XHR']]
        : allResourceOptions;
    return `
      <div class="input-group">
        <label class="input-label">HTTP Methods</label>
        <div class="filter-chip-grid">
          ${methodOptions.map((method) => `
            <label class="filter-chip">
              <input type="checkbox" name="rule-method" value="${method}" ${methods.includes(method as typeof methods[number]) ? 'checked' : ''}/>
              <span>${method === '*' ? 'All' : method}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">Resource Types</label>
        <div class="filter-chip-grid">
          ${resourceOptions.map(([value, label]) => `
            <label class="filter-chip">
              <input type="checkbox" name="rule-resource" value="${value}" ${(resources.includes(value as typeof resources[number]) || (isPageInterceptor && resources.includes('*'))) ? 'checked' : ''}/>
              <span>${label}</span>
            </label>`).join('')}
        </div>
      </div>`;
  }

  private buildTypeSpecificFields(type: RuleType, rule: AnyRule | undefined): string {
    if (type === 'header') {
      const target = (rule as HeaderRule)?.target ?? 'request';
      return `
        <div class="input-group">
          <label class="input-label">Target</label>
          <div style="display:flex;gap:var(--space-4)">
            <label class="checkbox-wrapper"><input type="radio" name="target" value="request" ${target === 'request' ? 'checked' : ''}/>Request</label>
            <label class="checkbox-wrapper"><input type="radio" name="target" value="response" ${target === 'response' ? 'checked' : ''}/>Response</label>
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">Header Operations <span class="required">*</span></label>
          <span class="input-error-msg" id="err-headers" style="display:none">${Icons.alertTriangle({ size: 12 })} Add at least one header operation</span>
          <div class="operations-list" id="header-ops-list">${this.renderHeaderOps()}</div>
          <button class="btn btn-ghost btn-sm" id="btn-add-header" style="margin-top:var(--space-2);align-self:flex-start">
            ${Icons.plus({ size: 14 })} Add Header
          </button>
        </div>`;
    }
    if (type === 'redirect') {
      const redirectUrl = escapeHtml((rule as RedirectRule)?.redirectUrl ?? '');
      return `
        <div class="input-group">
          <label class="input-label" for="rule-redirect-url">Destination URL <span class="required">*</span></label>
          <input id="rule-redirect-url" class="input" type="text" placeholder="https://api.dev.example.com/" value="${redirectUrl}"/>
          <span class="input-error-msg" id="err-redirect" style="display:none">${Icons.alertTriangle({ size: 12 })} Required</span>
        </div>`;
    }
    if (type === 'queryParam') {
      return `
        <div class="input-group">
          <label class="input-label">Parameter Operations <span class="required">*</span></label>
          <span class="input-error-msg" id="err-params" style="display:none">${Icons.alertTriangle({ size: 12 })} Add at least one param</span>
          <div class="operations-list" id="param-ops-list">${this.renderParamOps()}</div>
          <button class="btn btn-ghost btn-sm" id="btn-add-param" style="margin-top:var(--space-2);align-self:flex-start">
            ${Icons.plus({ size: 14 })} Add Parameter
          </button>
        </div>`;
    }
    if (type === 'mock') {
      const mr = rule as MockApiRule;
      return `
        <div class="form-row">
          <div class="input-group">
            <label class="input-label" for="rule-status-code">Status Code</label>
            <input id="rule-status-code" class="input" type="number" min="200" max="599" value="${mr?.statusCode ?? 200}"/>
          </div>
          <div class="input-group">
            <label class="input-label" for="rule-delay">Delay (ms)</label>
            <input id="rule-delay" class="input" type="number" min="0" value="${mr?.delay ?? 0}"/>
          </div>
        </div>
        <div class="input-group">
          <label class="input-label" for="rule-response-body">Response Body</label>
          <textarea id="rule-response-body" class="textarea" style="min-height:160px;font-family:var(--font-mono)">${escapeHtml(mr?.responseBody ?? '')}</textarea>
        </div>
        <div class="input-group">
          <label class="input-label">Response Headers</label>
          <div class="operations-list" id="header-ops-list">${this.renderHeaderOps()}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-add-header" style="margin-top:var(--space-2);align-self:flex-start">
            ${Icons.plus({ size: 14 })} Add Response Header
          </button>
        </div>`;
    }
    if (type === 'responseOverride') {
      const rr = rule as { body?: string; statusCode?: number };
      return `
        <div class="input-group">
          <label class="input-label" for="rule-override-status">Override Status Code (optional)</label>
          <input id="rule-override-status" class="input" type="number" min="100" max="599" placeholder="e.g. 200" value="${rr?.statusCode ?? ''}"/>
        </div>
        <div class="input-group">
          <label class="input-label" for="rule-override-body">Override Body</label>
          <textarea id="rule-override-body" class="textarea" style="min-height:140px;font-family:var(--font-mono)">${escapeHtml(rr?.body ?? '')}</textarea>
        </div>`;
    }
    if (type === 'cookie') {
      return `
        <div class="input-group">
          <label class="input-label">Cookie Operations <span class="required">*</span></label>
          <span class="input-error-msg" id="err-cookies" style="display:none">${Icons.alertTriangle({ size: 12 })} Add at least one cookie</span>
          <div class="operations-list" id="cookie-ops-list">${this.renderCookieOps()}</div>
          <button class="btn btn-ghost btn-sm" id="btn-add-cookie" style="margin-top:var(--space-2);align-self:flex-start">
            ${Icons.plus({ size: 14 })} Add Cookie
          </button>
        </div>`;
    }
    return '';
  }

  private renderHeaderOps(): string {
    if (!this.headerOps.length) return '';
    return this.headerOps.map((op, i) => `
      <div class="operation-row" data-index="${i}">
        <input class="input" type="text" placeholder="Header name" value="${escapeHtml(op.name)}" data-field="name" list="header-suggestions"/>
        <input class="input" type="text" placeholder="Value" value="${escapeHtml(op.value)}" data-field="value"/>
        <select class="select" data-field="operation">
          <option value="set" ${op.operation === 'set' ? 'selected' : ''}>Set</option>
          <option value="append" ${op.operation === 'append' ? 'selected' : ''}>Append</option>
          <option value="remove" ${op.operation === 'remove' ? 'selected' : ''}>Remove</option>
        </select>
        <button class="btn btn-ghost btn-icon btn-sm" data-remove-header="${i}" aria-label="Remove">${Icons.trash({ size: 14 })}</button>
      </div>`).join('');
  }

  private renderParamOps(): string {
    if (!this.queryOps.length) return '';
    return this.queryOps.map((op, i) => `
      <div class="operation-row param-row" data-index="${i}">
        <input class="input" type="text" placeholder="Key" value="${escapeHtml(op.key)}" data-pfield="key"/>
        <input class="input" type="text" placeholder="Value" value="${escapeHtml(op.value)}" data-pfield="value"/>
        <select class="select" data-pfield="operation">
          <option value="set" ${op.operation === 'set' ? 'selected' : ''}>Set</option>
          <option value="remove" ${op.operation === 'remove' ? 'selected' : ''}>Remove</option>
        </select>
        <button class="btn btn-ghost btn-icon btn-sm" data-remove-param="${i}" aria-label="Remove">${Icons.trash({ size: 14 })}</button>
      </div>`).join('');
  }

  private renderCookieOps(): string {
    if (!this.cookieOps.length) return '';
    return this.cookieOps.map((op, i) => `
      <div class="operation-row" data-index="${i}">
        <input class="input" type="text" placeholder="Cookie name" value="${escapeHtml(op.name)}" data-cfield="name"/>
        <input class="input" type="text" placeholder="Value" value="${escapeHtml(op.value)}" data-cfield="value"/>
        <select class="select" data-cfield="operation">
          <option value="set" ${op.operation === 'set' ? 'selected' : ''}>Set</option>
          <option value="remove" ${op.operation === 'remove' ? 'selected' : ''}>Remove</option>
        </select>
        <button class="btn btn-ghost btn-icon btn-sm" data-remove-cookie="${i}" aria-label="Remove">${Icons.trash({ size: 14 })}</button>
      </div>`).join('');
  }

  private refreshHeaderOps(): void {
    const list = this.drawer.querySelector('#header-ops-list');
    if (list) list.innerHTML = this.renderHeaderOps();
    this.attachOpEvents();
  }

  private refreshParamOps(): void {
    const list = this.drawer.querySelector('#param-ops-list');
    if (list) list.innerHTML = this.renderParamOps();
    this.attachOpEvents();
  }

  private refreshCookieOps(): void {
    const list = this.drawer.querySelector('#cookie-ops-list');
    if (list) list.innerHTML = this.renderCookieOps();
    this.attachOpEvents();
  }

  private attachOpEvents(): void {
    // Header ops
    this.drawer.querySelectorAll('[data-field]').forEach((el) => {
      const row = (el as HTMLElement).closest('[data-index]') as HTMLElement;
      const idx = parseInt(row?.dataset.index ?? '0');
      const field = (el as HTMLElement).dataset.field as keyof HeaderOperation;
      el.addEventListener('change', () => {
        if (this.headerOps[idx]) {
          (this.headerOps[idx] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });

    this.drawer.querySelectorAll('[data-remove-header]').forEach((btn) => {
      const idx = parseInt((btn as HTMLElement).dataset.removeHeader ?? '0');
      btn.addEventListener('click', () => { this.headerOps.splice(idx, 1); this.refreshHeaderOps(); });
    });

    // Param ops
    this.drawer.querySelectorAll('[data-pfield]').forEach((el) => {
      const row = (el as HTMLElement).closest('[data-index]') as HTMLElement;
      const idx = parseInt(row?.dataset.index ?? '0');
      const field = (el as HTMLElement).dataset.pfield as keyof QueryParamOperation;
      el.addEventListener('change', () => {
        if (this.queryOps[idx]) {
          (this.queryOps[idx] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });

    this.drawer.querySelectorAll('[data-remove-param]').forEach((btn) => {
      const idx = parseInt((btn as HTMLElement).dataset.removeParam ?? '0');
      btn.addEventListener('click', () => { this.queryOps.splice(idx, 1); this.refreshParamOps(); });
    });

    // Cookie ops
    this.drawer.querySelectorAll('[data-cfield]').forEach((el) => {
      const row = (el as HTMLElement).closest('[data-index]') as HTMLElement;
      const idx = parseInt(row?.dataset.index ?? '0');
      const field = (el as HTMLElement).dataset.cfield as keyof CookieOperation;
      el.addEventListener('change', () => {
        if (this.cookieOps[idx]) {
          (this.cookieOps[idx] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });

    this.drawer.querySelectorAll('[data-remove-cookie]').forEach((btn) => {
      const idx = parseInt((btn as HTMLElement).dataset.removeCookie ?? '0');
      btn.addEventListener('click', () => { this.cookieOps.splice(idx, 1); this.refreshCookieOps(); });
    });
  }

  private attachEvents(type: RuleType, _isEdit: boolean): void {
    // Datalist for header autocomplete
    if (type === 'header') {
      const datalist = document.createElement('datalist');
      datalist.id = 'header-suggestions';
      datalist.innerHTML = COMMON_HEADERS.map((h) => `<option value="${h}"/>`).join('');
      this.drawer.appendChild(datalist);
    }

    this.attachOpEvents();

    this.drawer.querySelector('#drawer-close')?.addEventListener('click', () => this.close());
    this.drawer.querySelector('#btn-cancel')?.addEventListener('click', () => this.close());

    this.drawer.querySelector('#btn-add-header')?.addEventListener('click', () => {
      this.headerOps.push({ name: '', value: '', operation: 'set' });
      this.refreshHeaderOps();
    });
    this.drawer.querySelector('#btn-add-param')?.addEventListener('click', () => {
      this.queryOps.push({ key: '', value: '', operation: 'set' });
      this.refreshParamOps();
    });
    this.drawer.querySelector('#btn-add-cookie')?.addEventListener('click', () => {
      this.cookieOps.push({ name: '', value: '', operation: 'set' });
      this.refreshCookieOps();
    });

    const wireExclusiveAll = (name: string) => {
      const controls = Array.from(this.drawer.querySelectorAll<HTMLInputElement>(`[name="${name}"]`));
      controls.forEach((control) => {
        control.addEventListener('change', () => {
          if (control.value === '*' && control.checked) {
            controls.forEach((candidate) => {
              if (candidate !== control) candidate.checked = false;
            });
          } else if (control.checked) {
            const all = controls.find((candidate) => candidate.value === '*');
            if (all) all.checked = false;
          }
          if (!controls.some((candidate) => candidate.checked)) {
            const all = controls.find((candidate) => candidate.value === '*');
            if (all) all.checked = true;
          }
        });
      });
    };
    wireExclusiveAll('rule-method');
    wireExclusiveAll('rule-resource');

    const allEnvironments = this.drawer.querySelector<HTMLInputElement>('#rule-env-all');
    const environmentControls = Array.from(
      this.drawer.querySelectorAll<HTMLInputElement>('[name="rule-environment"]')
    );
    allEnvironments?.addEventListener('change', () => {
      if (allEnvironments.checked) {
        environmentControls.forEach((control) => { control.checked = false; });
      } else if (!environmentControls.some((control) => control.checked)) {
        allEnvironments.checked = true;
      }
    });
    environmentControls.forEach((control) => {
      control.addEventListener('change', () => {
        if (control.checked && allEnvironments) allEnvironments.checked = false;
        if (
          !environmentControls.some((candidate) => candidate.checked) &&
          allEnvironments
        ) {
          allEnvironments.checked = true;
        }
      });
    });

    this.drawer.querySelector('#btn-test-rule')?.addEventListener('click', () => {
      const testUrl = this.getFormValue('rule-test-url');
      const result = this.drawer.querySelector('#rule-test-result') as HTMLElement | null;
      if (!result) return;
      if (!testUrl) {
        result.textContent = 'Enter a URL first.';
        result.style.color = 'var(--color-warning)';
        return;
      }
      const pattern = resolveVariables(this.getFormValue('rule-url'), this.options.environment);
      const method = this.getFormValue('rule-test-method').toUpperCase();
      const selectedMethods = this.getCheckedValues('rule-method');
      const methodMatches = selectedMethods.includes('*') || selectedMethods.includes(method);
      const urlMatches = matchesUrlPattern(pattern, this.getChecked('rule-regex'), testUrl);
      const matched = urlMatches && methodMatches;
      result.textContent = matched
        ? 'Match: this request will be targeted.'
        : `No match: ${urlMatches ? 'the HTTP method is excluded' : 'the URL pattern does not match'}.`;
      result.style.color = matched ? 'var(--color-success)' : 'var(--color-error)';
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.drawer.querySelector('#btn-save')?.addEventListener('click', () => void this.handleSave(type, false));
    this.drawer.querySelector('#btn-save-dup')?.addEventListener('click', () => void this.handleSave(type, true));

    // Ctrl+S shortcut
    this.keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void this.handleSave(type, false);
      }
      if (e.key === 'Escape') this.close();
      if (e.key === 'Tab') {
        const focusable = Array.from(this.drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private getFormValue(id: string): string {
    return (this.drawer.querySelector(`#${id}`) as HTMLInputElement)?.value?.trim() ?? '';
  }

  private getChecked(id: string): boolean {
    return (this.drawer.querySelector(`#${id}`) as HTMLInputElement)?.checked ?? false;
  }

  private getCheckedValues(name: string): string[] {
    return Array.from(this.drawer.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`))
      .map((input) => input.value);
  }

  private showError(id: string, show: boolean): void {
    const el = this.drawer.querySelector(`#${id}`) as HTMLElement | null;
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  private async handleSave(type: RuleType, duplicate: boolean): Promise<void> {
    // Read current values from form
    this.syncOpsFromDOM();

    const name = this.getFormValue('rule-name');
    const url  = this.getFormValue('rule-url');
    let valid = true;

    if (!name) { this.showError('err-name', true); valid = false; }
    else this.showError('err-name', false);

    if (!url) { this.showError('err-url', true); valid = false; }
    else this.showError('err-url', false);

    if (type === 'header' && !this.headerOps.length) {
      this.showError('err-headers', true); valid = false;
    } else if (type === 'header') this.showError('err-headers', false);

    if (type === 'queryParam' && !this.queryOps.length) {
      this.showError('err-params', true); valid = false;
    } else if (type === 'queryParam') this.showError('err-params', false);

    if (type === 'cookie' && !this.cookieOps.length) {
      this.showError('err-cookies', true); valid = false;
    } else if (type === 'cookie') this.showError('err-cookies', false);

    if (type === 'redirect' && !this.getFormValue('rule-redirect-url')) {
      this.showError('err-redirect', true); valid = false;
    } else if (type === 'redirect') this.showError('err-redirect', false);

    if (!valid) return;

    const now = new Date().toISOString();
    const baseId = this.options.rule?.id ?? generateId();

    const base = {
      id: baseId,
      name,
      enabled: this.getChecked('rule-enabled'),
      priority: parseInt(this.getFormValue('rule-priority') || '1'),
      description: this.getFormValue('rule-desc'),
      group: this.getFormValue('rule-group') || undefined,
      tags: this.getFormValue('rule-tags')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10),
      environmentIds: this.getChecked('rule-env-all')
        ? undefined
        : this.getCheckedValues('rule-environment'),
      createdAt: this.options.rule?.createdAt ?? now,
      updatedAt: now,
      urlMatcher: {
        pattern: url,
        isRegex: this.getChecked('rule-regex'),
        resourceTypes: this.getCheckedValues('rule-resource') as AnyRule['urlMatcher']['resourceTypes'],
        httpMethods: this.getCheckedValues('rule-method') as AnyRule['urlMatcher']['httpMethods'],
      },
    };

    let rule: AnyRule;
    if (type === 'header') {
      const t = (this.drawer.querySelector('[name="target"]:checked') as HTMLInputElement)?.value as 'request' | 'response' || 'request';
      rule = { ...base, type: 'header', headers: this.headerOps, target: t } as HeaderRule;
    } else if (type === 'redirect') {
      rule = { ...base, type: 'redirect', redirectUrl: this.getFormValue('rule-redirect-url') } as RedirectRule;
    } else if (type === 'queryParam') {
      rule = { ...base, type: 'queryParam', params: this.queryOps } as QueryParamRule;
    } else if (type === 'mock') {
      rule = {
        ...base, type: 'mock',
        statusCode: parseInt(this.getFormValue('rule-status-code') || '200'),
        responseBody: (this.drawer.querySelector('#rule-response-body') as HTMLTextAreaElement)?.value ?? '',
        responseHeaders: this.headerOps,
        delay: parseInt(this.getFormValue('rule-delay') || '0'),
      } as MockApiRule;
    } else if (type === 'cookie') {
      rule = { ...base, type: 'cookie', cookies: this.cookieOps } as CookieRule;
    } else {
      // responseOverride
      rule = {
        ...base, type: 'responseOverride',
        body: (this.drawer.querySelector('#rule-override-body') as HTMLTextAreaElement)?.value ?? '',
        statusCode: parseInt(this.getFormValue('rule-override-status') || '0') || undefined,
      } as AnyRule;
    }

    const validation = validateRule(rule);
    if (!validation.valid) {
      toast.error('Rule is not valid', validation.errors[0]);
      return;
    }
    const unresolved = findUnresolvedVariables(JSON.stringify(rule), this.options.environment);
    if (
      rule.enabled &&
      ruleAppliesToEnvironment(rule, this.options.environment) &&
      unresolved.length
    ) {
      toast.error(
        'Enabled rule has unresolved variables',
        `Define ${Array.from(new Set(unresolved)).join(', ')} in the active environment or save the rule disabled.`
      );
      return;
    }

    const saveButtons = Array.from(this.drawer.querySelectorAll<HTMLButtonElement>('#btn-save, #btn-save-dup'));
    saveButtons.forEach((button) => { button.disabled = true; });
    try {
      await this.options.onSave(rule);
      if (duplicate) {
        const copy: AnyRule = {
          ...rule,
          id: generateId(),
          name: `${rule.name} (Copy)`,
          enabled: false,
          createdAt: now,
          updatedAt: now,
        } as AnyRule;
        await this.options.onSave(copy);
      }
      toast.success(duplicate ? 'Rule saved and duplicated' : 'Rule saved successfully');
      this.close(true);
    } catch (error) {
      toast.error('Rule could not be saved', String(error));
      saveButtons.forEach((button) => { button.disabled = false; });
    }
  }

  private syncOpsFromDOM(): void {
    // Sync any changes made without triggering change event
    this.drawer.querySelectorAll('#header-ops-list .operation-row').forEach((row, i) => {
      const inputs = row.querySelectorAll('[data-field]');
      inputs.forEach((el) => {
        const field = (el as HTMLElement).dataset.field as keyof HeaderOperation;
        if (this.headerOps[i]) {
          (this.headerOps[i] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });

    this.drawer.querySelectorAll('#param-ops-list .operation-row').forEach((row, i) => {
      row.querySelectorAll('[data-pfield]').forEach((el) => {
        const field = (el as HTMLElement).dataset.pfield as keyof QueryParamOperation;
        if (this.queryOps[i]) {
          (this.queryOps[i] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });

    this.drawer.querySelectorAll('#cookie-ops-list .operation-row').forEach((row, i) => {
      row.querySelectorAll('[data-cfield]').forEach((el) => {
        const field = (el as HTMLElement).dataset.cfield as keyof CookieOperation;
        if (this.cookieOps[i]) {
          (this.cookieOps[i] as Record<string, string>)[field] = (el as HTMLInputElement | HTMLSelectElement).value;
        }
      });
    });
  }
}
