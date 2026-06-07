import { walkElements, resolveBinding } from '@jay-framework/compiler-shared';
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';

export const validate = (ctx) => {
  if (!ctx.contract) return [];
  const findings = [];

  walkElements(ctx.body, ctx, (el, scope) => {
    if (el.rawTagName !== 'img') return;
    const src = el.getAttribute && el.getAttribute('src');
    if (!src) return;

    const parts = parseTemplateParts(src);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.kind !== 'binding') continue;

      const resolved = resolveBinding(part.value, scope);
      if (!resolved.tag?.meta || resolved.tag.meta['wix-type'] !== 'image') continue;

      const next = parts[i + 1];
      if (!next || next.kind !== 'static' || !next.value.includes('?resize')) {
        findings.push({
          severity: 'warning',
          message: `Wix image binding {${part.value}} missing resize params`,
          suggestion: `Add ?resize=... after the binding: {${part.value}}?resize=w_300,h_200`,
          element: el.rawTagName,
          attribute: 'src',
        });
      }
    }
  });

  return findings;
};
