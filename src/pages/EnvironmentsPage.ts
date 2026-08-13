import type { Environment, EnvironmentVariable } from '../models/types.js';
import { Icons } from '../utils/icons.js';
import { generateId, escapeHtml } from '../utils/helpers.js';
import { bindEnvironmentCreationButtons } from '../utils/eventBindings.js';
import { showConfirm, showPrompt } from '../components/Modal.js';
import { toast } from '../components/Toast.js';

interface EnvPageOptions {
  environments: Environment[];
  onSave: (env: Environment) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetActive: (id: string) => Promise<void>;
}

export function renderEnvironmentsPage(opts: EnvPageOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fade-in';
  let envs = [...opts.environments];
  let selectedEnvId: string | null = envs.find((e) => e.isActive)?.id ?? envs[0]?.id ?? null;

  const render = () => {
    el.innerHTML = buildHtml(envs, selectedEnvId);
    attachEvents();
  };

  const attachEvents = () => {
    // Sidebar env list
    el.querySelectorAll('[data-env-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedEnvId = (btn as HTMLElement).dataset.envId!;
        render();
      });
    });

    // Set active
    el.querySelectorAll('[data-set-active]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.setActive!;
        const previous = envs.map((environment) => environment.isActive);
        envs.forEach((e) => (e.isActive = e.id === id));
        try {
          await opts.onSetActive(id);
          toast.success('Environment activated');
          render();
        } catch (error) {
          envs.forEach((environment, index) => { environment.isActive = previous[index]; });
          toast.error('Environment could not be activated', String(error));
        }
      });
    });

    // Add environment from either the sidebar shortcut or the empty state.
    bindEnvironmentCreationButtons(el, async () => {
      const name = await showPrompt('New Environment', 'Environment name');
      if (!name) return;
      const newEnv: Environment = { id: generateId(), name, variables: [], isActive: envs.length === 0 };
      envs.push(newEnv);
      selectedEnvId = newEnv.id;
      await opts.onSave(newEnv);
      render();
    });

    // Duplicate environment
    el.querySelector('#btn-dup-env')?.addEventListener('click', async () => {
      const env = envs.find((e) => e.id === selectedEnvId);
      if (!env) return;
      const name = await showPrompt('Duplicate Environment', 'New environment name', `${env.name} (Copy)`);
      if (!name) return;
      const copy: Environment = { ...env, id: generateId(), name, isActive: false, variables: env.variables.map((v) => ({ ...v })) };
      envs.push(copy);
      selectedEnvId = copy.id;
      await opts.onSave(copy);
      render();
    });

    // Delete environment
    el.querySelector('#btn-del-env')?.addEventListener('click', async () => {
      const env = envs.find((e) => e.id === selectedEnvId);
      if (!env) return;
      const confirmed = await showConfirm({
        title: 'Delete Environment',
        body: `Delete "${env.name}"? All variables will be lost.`,
        confirmLabel: 'Delete', variant: 'danger',
      });
      if (!confirmed) return;
      const wasActive = env.isActive;
      await opts.onDelete(env.id);
      envs = envs.filter((e) => e.id !== env.id);
      if (wasActive && envs.length) {
        envs.forEach((candidate, index) => { candidate.isActive = index === 0; });
      }
      selectedEnvId = envs[0]?.id ?? null;
      toast.success('Environment deleted');
      render();
    });

    // Add variable
    el.querySelector('#btn-add-var')?.addEventListener('click', async () => {
      const env = envs.find((e) => e.id === selectedEnvId);
      if (!env) return;
      env.variables.push({ key: '', value: '', description: '' });
      await opts.onSave(env);
      render();
      // Focus new row
      const rows = el.querySelectorAll('.env-var-row');
      const last = rows[rows.length - 1];
      (last?.querySelector('input') as HTMLInputElement)?.focus();
    });

    // Inline editing for variable rows
    el.querySelectorAll('.env-var-row').forEach((row) => {
      const idx = parseInt((row as HTMLElement).dataset.idx!);
      const env = envs.find((e) => e.id === selectedEnvId);
      if (!env) return;

      row.querySelectorAll('[data-var-field]').forEach((input) => {
        input.addEventListener('change', async () => {
          const field = (input as HTMLElement).dataset.varField as keyof EnvironmentVariable;
          const inputElement = input as HTMLInputElement;
          env.variables[idx] = {
            ...env.variables[idx],
            [field]: inputElement.type === 'checkbox' ? inputElement.checked : inputElement.value,
          };
          await opts.onSave(env);
          if (field === 'isSecret') render();
        });
      });

      row.querySelector('[data-del-var]')?.addEventListener('click', async () => {
        env.variables.splice(idx, 1);
        await opts.onSave(env);
        render();
      });
    });
  };

  render();
  return el;
}

function buildHtml(envs: Environment[], selectedId: string | null): string {
  const selected = envs.find((e) => e.id === selectedId);
  return `
    <div class="environment-layout">
      <!-- Environment Sidebar -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
          <span style="font-size:var(--text-sm);font-weight:var(--font-semibold);color:var(--color-text-secondary)">ENVIRONMENTS</span>
          <button class="btn btn-ghost btn-icon btn-sm" data-add-env data-tooltip="New Environment">${Icons.plus({ size: 14 })}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${envs.map((e) => `
            <div data-env-id="${escapeHtml(e.id)}" style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);cursor:pointer;background:${e.id === selectedId ? 'var(--color-primary-light)' : 'transparent'};color:${e.id === selectedId ? 'var(--color-primary)' : 'var(--color-text-primary)'}">
              <span style="flex:1;font-size:var(--text-sm);font-weight:var(--font-medium)">${escapeHtml(e.name)}</span>
              ${e.isActive ? `<span class="badge badge-green" style="font-size:10px">Active</span>` : ''}
            </div>
          `).join('')}
          ${envs.length === 0 ? `<p style="font-size:var(--text-sm);color:var(--color-text-tertiary);padding:var(--space-2)">No environments</p>` : ''}
        </div>
      </div>

      <!-- Environment Detail -->
      <div>
        ${selected ? `
          <div class="card">
            <div class="card-header">
              <div>
                <div style="font-weight:var(--font-semibold);font-size:var(--text-md)">${escapeHtml(selected.name)}</div>
                <div style="font-size:var(--text-xs);color:var(--color-text-tertiary)">${selected.variables.length} variable${selected.variables.length !== 1 ? 's' : ''}</div>
              </div>
              <div style="display:flex;gap:var(--space-2)">
                ${!selected.isActive ? `<button class="btn btn-secondary btn-sm" data-set-active="${escapeHtml(selected.id)}">${Icons.checkCircle({ size: 14 })} Set Active</button>` : `<span class="badge badge-green">${Icons.check({ size: 12 })} Active</span>`}
                <button class="btn btn-ghost btn-icon btn-sm" id="btn-dup-env" data-tooltip="Duplicate">${Icons.copy({ size: 14 })}</button>
                <button class="btn btn-ghost btn-icon btn-sm" id="btn-del-env" data-tooltip="Delete" style="color:var(--color-error)">${Icons.trash({ size: 14 })}</button>
              </div>
            </div>
            <div class="card-body" style="padding:0">
              <table class="env-table" style="width:100%">
                <thead>
                  <tr>
                    <th style="width:200px">Key</th>
                    <th>Value</th>
                    <th>Description</th>
                    <th style="width:72px">Secret</th>
                    <th style="width:40px"></th>
                  </tr>
                </thead>
                <tbody>
                  ${selected.variables.map((v, i) => `
                    <tr class="env-var-row" data-idx="${i}">
                      <td><input class="input" type="text" value="${escapeHtml(v.key)}" placeholder="VARIABLE_KEY" data-var-field="key" style="font-family:var(--font-mono);font-size:var(--text-xs)"/></td>
                      <td><input class="input" type="${v.isSecret ? 'password' : 'text'}" value="${escapeHtml(v.value)}" placeholder="value" data-var-field="value" autocomplete="off" style="font-family:var(--font-mono);font-size:var(--text-xs)"/></td>
                      <td><input class="input" type="text" value="${escapeHtml(v.description ?? '')}" placeholder="Optional description" data-var-field="description"/></td>
                      <td style="text-align:center"><input type="checkbox" data-var-field="isSecret" aria-label="Treat ${escapeHtml(v.key || 'variable')} as secret" ${v.isSecret ? 'checked' : ''}/></td>
                      <td><button class="btn btn-ghost btn-icon btn-sm" data-del-var="${i}" style="color:var(--color-error)">${Icons.trash({ size: 13 })}</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div style="padding:var(--space-4) var(--space-5)">
                <button class="btn btn-ghost btn-sm" id="btn-add-var">${Icons.plus({ size: 14 })} Add Variable</button>
              </div>
            </div>
            <div class="card-footer" style="font-size:var(--text-xs);color:var(--color-text-tertiary)">
              ${Icons.info({ size: 13 })} Use <code style="background:var(--color-bg);padding:1px 4px;border-radius:3px;font-family:var(--font-mono)">{{KEY}}</code> in rule fields to reference variables
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-state-icon">${Icons.environment({ size: 28 })}</div>
            <h3 class="empty-state-title">No Environment Selected</h3>
            <p class="empty-state-desc">Select an environment from the sidebar or create a new one.</p>
            <button class="btn btn-primary" data-add-env>${Icons.plus({ size: 14 })} New Environment</button>
          </div>
        `}
      </div>
    </div>`;
}
