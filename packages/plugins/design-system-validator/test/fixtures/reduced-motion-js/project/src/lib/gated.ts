const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const go = (el: HTMLElement) =>
    el.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth' });
export const s = { behavior: 'smooth' };
