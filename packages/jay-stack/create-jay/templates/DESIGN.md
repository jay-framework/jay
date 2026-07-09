---
name: My Design System

colors:
  primary: '#2563eb'
  primary-hover: '#1d4ed8'
  secondary: '#64748b'
  text: '#0f172a'
  text-muted: '#64748b'
  background: '#ffffff'
  surface: '#f8fafc'
  border: '#e2e8f0'
  error: '#dc2626'
  success: '#16a34a'

typography:
  headline-lg:
    fontFamily: system-ui, sans-serif
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.2
  headline-md:
    fontFamily: system-ui, sans-serif
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: system-ui, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: system-ui, sans-serif
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.5

spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  2xl: 3rem

rounded:
  none: 0
  sm: 0.25rem
  md: 0.5rem
  lg: 0.75rem
  full: 9999px

animations:
  micro:
    duration: 150ms
    easing: ease-in-out
  normal:
    duration: 300ms
    easing: cubic-bezier(0, 0, 0.2, 1)

rules:
  max-font-weights: 3
  max-primary-buttons: 1
  require-contrast-aa: true
---

# My Design System

Edit this file to define your design tokens. The design-system-validator plugin validates your CSS against these tokens during `jay-stack validate`.

See `agent-kit/designer/design-system.md` for usage guide.
