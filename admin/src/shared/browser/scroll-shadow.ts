/** Marks this scroll pane only; adjacent fixed regions derive their shadow from it. */
export function scrollShadow(node: HTMLElement): { destroy: () => void } {
  const update = (): void => {
    node.dataset.scrolled = String(node.scrollTop > 0);
  };
  const observer = new ResizeObserver(update);

  update();
  node.addEventListener('scroll', update, { passive: true });
  observer.observe(node);

  return {
    destroy: () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
      delete node.dataset.scrolled;
    },
  };
}
