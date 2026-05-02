import type { InspectorTarget } from '@/stores/appStore';

const isHTML = (el: Element): el is HTMLElement => el instanceof HTMLElement;

const getClassNameString = (el: Element): string => {
  if (!isHTML(el)) return '';
  return typeof el.className === 'string' ? el.className : '';
};

export const isInspectorUi = (el: Element | null): boolean => {
  let current: Element | null = el;
  while (current) {
    if (isHTML(current) && current.dataset.inspectorUi === 'true') return true;
    current = current.parentElement;
  }
  return false;
};

export const buildSelector = (el: Element): string => {
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 4) {
    let s = current.tagName.toLowerCase();
    if (current.id) {
      s += `#${current.id}`;
      parts.unshift(s);
      break;
    }
    const classes = getClassNameString(current).split(' ').filter(Boolean).slice(0, 2);
    if (classes.length) s += `.${classes.join('.')}`;
    parts.unshift(s);
    current = current.parentElement;
    depth += 1;
  }
  return parts.join(' > ');
};

export const findConfigSource = (el: Element): string | undefined => {
  let current: Element | null = el;
  while (current) {
    if (isHTML(current)) {
      const cfg =
        current.dataset.configId ||
        current.dataset.formId ||
        current.dataset.screenId ||
        current.dataset.configSource;
      if (cfg) return cfg;
    }
    current = current.parentElement;
  }
  return undefined;
};

export const buildTarget = (el: Element): InspectorTarget => {
  const rect = el.getBoundingClientRect();
  return {
    selector: buildSelector(el),
    tagName: el.tagName,
    className: getClassNameString(el),
    configSource: findConfigSource(el),
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  };
};
