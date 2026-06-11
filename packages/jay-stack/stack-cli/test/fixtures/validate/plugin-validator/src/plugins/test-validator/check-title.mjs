import { walkElements } from '@jay-framework/compiler-shared';

export const validate = (ctx) => {
  let hasTitle = false;

  walkElements(ctx.body, ctx, (el) => {
    if (el.rawTagName === 'title') hasTitle = true;
  });

  if (!hasTitle) {
    return [
      {
        severity: 'error',
        message: 'Page is missing a <title> element',
        suggestion: 'Add a <title> element inside <head>',
        element: 'title',
      },
    ];
  }
  return [];
};
