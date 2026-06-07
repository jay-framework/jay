import { walkElements } from '@jay-framework/compiler-shared';

export const validate = (ctx) => {
  const findings = [];

  walkElements(ctx.body, ctx, (el) => {
    if (el.rawTagName !== 'img') return;
    const alt = el.getAttribute && el.getAttribute('alt');
    if (!alt && alt !== '') {
      findings.push({
        severity: 'warning',
        message: 'Image element missing alt attribute',
        suggestion:
          'Add an alt attribute: alt="description" for informative images, or alt="" for decorative ones',
        element: 'img',
        attribute: 'alt',
      });
    }
  });

  return findings;
};
