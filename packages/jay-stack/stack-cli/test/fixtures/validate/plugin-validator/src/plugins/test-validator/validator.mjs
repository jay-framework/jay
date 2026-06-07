export const validate = (ctx) => {
  return [
    {
      severity: 'warning',
      message: 'Test validator finding',
      suggestion: 'This is a test suggestion',
      element: 'div',
    },
  ];
};
