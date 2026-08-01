import { Icons } from '../utils/icons.js';
import { escapeHtml } from '../utils/helpers.js';

interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

// ============================================================
// Modal / Confirm Dialog
// ============================================================

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const {
      title,
      body,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      variant = 'danger',
    } = opts;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    const btnClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';
    const iconHtml = variant === 'danger'
      ? `<div class="modal-icon danger">${Icons.alertTriangle({ size: 22 })}</div>`
      : '';

    overlay.innerHTML = `
      <div class="modal" role="document">
        ${iconHtml}
        <h2 class="modal-title" id="modal-title">${escapeHtml(title)}</h2>
        <p class="modal-body">${escapeHtml(body)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${btnClass}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Trigger animation
    requestAnimationFrame(() => overlay.classList.add('open'));

    const previousFocus = document.activeElement as HTMLElement | null;
    let closing = false;
    const close = (result: boolean) => {
      if (closing) return;
      closing = true;
      document.removeEventListener('keydown', handleKey);
      overlay.classList.remove('open');
      setTimeout(() => {
        overlay.remove();
        previousFocus?.focus();
        resolve(result);
      }, 150);
    };

    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action === 'confirm') close(true);
      if (target.dataset.action === 'cancel' || target === overlay) close(false);
    });

    // Keyboard handling
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', handleKey); }
      if (e.key === 'Enter') { close(true); document.removeEventListener('keydown', handleKey); }
      if (e.key === 'Tab') {
        const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button'));
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);

    // Focus the cancel button by default for safety
    setTimeout(() => {
      const cancelBtn = overlay.querySelector('[data-action="cancel"]') as HTMLButtonElement;
      cancelBtn?.focus();
    }, 50);
  });
}

export function showPrompt(
  title: string,
  label: string,
  initialValue = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'prompt-title');
    overlay.innerHTML = `
      <div class="modal prompt-modal" role="document">
        <h2 class="modal-title" id="prompt-title">${escapeHtml(title)}</h2>
        <div class="input-group">
          <label class="input-label" for="prompt-input">${escapeHtml(label)}</label>
          <input class="input" id="prompt-input" maxlength="80" value="${escapeHtml(initialValue)}" />
          <div class="input-error-msg" id="prompt-error" role="alert" style="display:none">
            A value is required.
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn btn-primary" data-action="confirm">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    const input = overlay.querySelector('#prompt-input') as HTMLInputElement;
    const error = overlay.querySelector('#prompt-error') as HTMLElement;
    let closing = false;
    const close = (value: string | null) => {
      if (closing) return;
      closing = true;
      document.removeEventListener('keydown', handleKey);
      overlay.classList.remove('open');
      setTimeout(() => {
        overlay.remove();
        previousFocus?.focus();
        resolve(value);
      }, 150);
    };
    const confirm = () => {
      const value = input.value.trim();
      if (!value) {
        error.style.display = 'block';
        input.focus();
        return;
      }
      close(value);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('input, button'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === 'confirm') confirm();
      if (target.dataset.action === 'cancel' || target === overlay) close(null);
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}
