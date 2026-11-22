interface IFieldPresentation {
  readonly readonly: boolean;
  readonly changedFields: readonly string[];
  readonly unsavedFields: readonly string[];
}

const fields: Readonly<Record<string, string>> = {
  'page-title': 'title',
  'page-h1': 'h1',
  'page-meta-title': 'metaTitle',
  'page-meta-description': 'metaDescription',
  'page-robots': 'robotsIndex',
  'page-og-title': 'ogTitle',
  'page-og-description': 'ogDescription',
  'page-og-image': 'ogImage',
  'page-og-type': 'ogType',
  'page-template': 'rendering.templateId',
  'page-mime': 'mimeType',
  'page-custom-mime': 'mimeType',
  'page-order': 'sortOrder',
  'page-parent': 'parentPageId',
  'page-mark': 'mark',
  'page-language': 'language',
  'page-content': 'contentMd',
};

/** Presents ordinary form controls as copyable read-only values without disabling the form. */
export function pageEditorFields(node: HTMLFormElement, initial: IFieldPresentation): {
  update: (value: IFieldPresentation) => void; destroy: () => void;
} {
  let current = initial;
  const restore = new Map<Element, () => void>();
  const observer = new MutationObserver(present);

  function present(): void {
    observer.disconnect();

    for (const control of node.querySelectorAll<HTMLElement>('[id]')) {
      const key = fields[control.id];
      const group = control.closest<HTMLElement>('._form-field, .og-image-field, ._page-field-group');

      if (key && group) {
        group.dataset.editorialField = key;
      }
    }

    for (const group of node.querySelectorAll<HTMLElement>('[data-editorial-field]')) {
      const key = group.dataset.editorialField ?? '';
      const changed = current.changedFields.includes(key);
      const unsaved = current.unsavedFields.includes(key);

      group.classList.toggle('_editorial-changed', changed);
      group.classList.toggle('_editorial-unsaved', unsaved);

    }

    if (current.readonly) {
      for (const control of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
        if (restore.has(control) || control.dataset.readonlyPresentation) {
          continue;
        }

        const wasReadonly = control.readOnly;
        const wasDisabled = control.disabled;

        control.readOnly = true;
        control.disabled = false;
        restore.set(control, () => {
          control.readOnly = wasReadonly;
          control.disabled = wasDisabled;
        });
      }

      for (const select of node.querySelectorAll<HTMLSelectElement>('select')) {
        if (restore.has(select)) {
          continue;
        }

        const input = document.createElement('input');
        const wasHidden = select.hidden;
        const wasDisabled = select.disabled;

        select.disabled = false;
        const id = select.id;

        input.type = 'text';
        input.readOnly = true;
        input.dataset.readonlyPresentation = 'true';
        input.value = [...select.selectedOptions].map((item) => item.textContent?.trim() ?? '').join(', ');
        input.className = 'cms-readonly-select';
        select.id = id + '-source';
        input.id = id;
        select.hidden = true;
        select.after(input);
        restore.set(select, () => {
          input.remove();
          select.hidden = wasHidden;
          select.disabled = wasDisabled;
          select.id = id;
        });
      }

      for (const fieldset of node.querySelectorAll('fieldset')) {
        if (restore.has(fieldset)) {
          continue;
        }

        const disabled = fieldset.disabled;

        fieldset.disabled = false;
        restore.set(fieldset, () => fieldset.disabled = disabled);
      }

      for (const checkbox of node.querySelectorAll('[role="checkbox"]')) {
        if (restore.has(checkbox)) {
          continue;
        }
        checkbox.setAttribute('aria-readonly', 'true');
        restore.set(checkbox, () => checkbox.removeAttribute('aria-readonly'));
      }
    }
    observer.observe(node, { childList: true, subtree: true });
  }
  function guard(event: Event): void {
    if (!current.readonly || !(event.target instanceof Element)) {
      return;
    }

    const target = event.target.closest('button, input, select, a, [role="checkbox"]');

    if (!target || target.getAttribute('role') === 'tab') {
      return;
    }
    if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.key === 'Tab')) {
      return;
    }
    if (target.matches('button, a, select, [role="checkbox"], input[type="checkbox"], input[type="radio"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  node.addEventListener('click', guard, true);
  node.addEventListener('keydown', guard, true);
  present();

  return {
    update(value): void {
      observer.disconnect();

      for (const reset of restore.values()) {
        reset();
      }
      restore.clear();
      current = value;
      present();
    },
    destroy(): void {
      observer.disconnect();
      node.removeEventListener('click', guard, true);
      node.removeEventListener('keydown', guard, true);

      for (const reset of restore.values()) {
        reset();
      }

    },
  };
}
