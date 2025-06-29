# Package Naming Migration to @jay-framework

## Overview

All package names have been migrated from `jay-something` to `@jay-framework/something` in preparation for open source release and to align with the planned NPM and GitHub organization names.

## Motivation

### Open Source Preparation
- **NPM Organization**: The packages will be published under the `@jay-framework` NPM organization
- **GitHub Organization**: The repository will be moved to the `jay-framework` GitHub organization
- **Consistency**: All package names now follow the scoped package naming convention

### Benefits
1. **Professional Branding**: Scoped packages provide better organization and branding
2. **Namespace Protection**: Prevents naming conflicts with other packages
3. **Clear Ownership**: Makes it clear these packages belong to the Jay Framework project
4. **Future Scalability**: Easier to add new packages under the same scope

## Changes Made

### Package Name Mapping

#### Compiler Packages
- `jay-compiler` → `@jay-framework/compiler`
- `jay-compiler-jay-html` → `@jay-framework/compiler-jay-html`
- `jay-compiler-analyze-exported-types` → `@jay-framework/compiler-analyze-exported-types`
- `jay-compiler-shared` → `@jay-framework/compiler-shared`
- `jay-cli` → `@jay-framework/jay-cli`
- `jay-rollup-plugin` → `@jay-framework/rollup-plugin`
- `jay-vite-plugin` → `@jay-framework/vite-plugin`

#### Runtime Packages
- `jay-component` → `@jay-framework/component`
- `jay-runtime` → `@jay-framework/runtime`
- `jay-json-patch` → `@jay-framework/json-patch`
- `jay-secure` → `@jay-framework/secure`
- `jay-serialization` → `@jay-framework/serialization`
- `jay-list-compare` → `@jay-framework/list-compare`
- `jay-reactive` → `@jay-framework/reactive`
- `jay-4-react` → `@jay-framework/4-react`

#### Jay Stack Packages
- `jay-dev-server` → `@jay-framework/dev-server`
- `jay-fullstack-component` → `@jay-framework/fullstack-component`
- `jay-stack-server-runtime` → `@jay-framework/stack-server-runtime`
- `jay-stack-cli` → `@jay-framework/stack-cli`
- `jay-stack-client-runtime` → `@jay-framework/stack-client-runtime`
- `jay-stack-route-scanner` → `@jay-framework/stack-route-scanner`

#### Other Packages
- `jay-dev-environment` → `@jay-framework/dev-environment`
- `jay-mutable` → `@jay-framework/mutable` (deprecated)

### Files Updated

#### Configuration Files
- **840 files** modified across the entire codebase
- All `package.json` files updated with new package names and dependencies
- All `vite.config.ts` files updated with new external rollupOptions
- All `tsconfig.json` files updated with new path mappings

#### Documentation Files
- **43 documentation files** updated
- All README.md files across packages and examples
- All documentation in `docs/` directory
- All design log entries
- All example project documentation

#### Code Files
- All import statements updated throughout the codebase
- All TypeScript/JavaScript files with package references
- All build artifacts and generated files

## Impact

### Breaking Changes
- **Internal Dependencies**: All internal package dependencies updated
- **Import Statements**: All import statements need to use new package names
- **Build Configuration**: All build tools need to reference new package names

### Migration Path
1. **Workspace Update**: Run `yarn install` to update workspace dependencies
2. **Build Verification**: Run `yarn build` to ensure everything builds correctly
3. **Test Execution**: Run `yarn test` to verify functionality
4. **Documentation Review**: Verify all documentation reflects new package names