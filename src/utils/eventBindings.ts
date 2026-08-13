export function bindEnvironmentCreationButtons(root: ParentNode, handler: () => void): void {
  root.querySelectorAll('[data-add-env]').forEach((button) => {
    button.addEventListener('click', handler);
  });
}
