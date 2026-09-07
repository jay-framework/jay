// Tools entry (DL#179 / DL#180): compiler-allowed, toolchain-only surfaces. Everything here is
// loaded under the Jay toolchain / dev server — never on the production serve path — so it may
// depend on the compiler (`@jay-framework/compiler-jay-html`, `compiler-shared`).
//
// Contents:
//  - validators                → `jay-stack validate`
//  - agent-kit generator       → `jay-stack agent-kit`
//  - devOnly settings actions  → dev-server action RPC from the /design-system/settings page (DL#180)
//  - devOnly settings page     → dev-server route component (DL#180)
//
// The compiler-free serve entry (`.` → index.ts) exports only the production `fontFallback` action.

// Validators (use walkElements / parseTemplateParts from the compiler)
export { validateTokens } from './validators/design-tokens.js';
export { validateComponents } from './validators/design-components.js';
export { validateStructure } from './validators/design-structure.js';
export { validateContrast } from './validators/design-contrast.js';
export { validateFontFallbacks } from './validators/design-font-fallbacks.js';
export { validateUndefinedVars } from './validators/design-undefined-vars.js';

// Agent-kit generator
export { generateDesignSystemAgentKit, ADD_MENU_GENERATED_REL } from './generate-add-menu.js';

// devOnly settings actions (browser-callable from the settings page; use the compiler via
// run-design-analysis.ts). Excluded from production builds — see plugin.yaml `devOnly: true`.
export {
    getDesignSystemSettingsStatus,
    runDesignSystemAnalysisAction as runDesignSystemAnalysis,
    loadDesignSystemAddMenuCatalog,
    saveDesignSystemAddMenuCatalog,
    regenerateDesignSystemAddMenu,
} from './settings-actions.js';

// devOnly settings page component (route /design-system/settings)
export { designSystemSettingsPage } from './pages/settings/page.js';
