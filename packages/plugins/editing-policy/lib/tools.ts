// Tools entry (DL#179): compiler-allowed, toolchain-only. Loaded by `jay-stack validate` via the
// `./tools` export for the project-level policy-file validator (DL#231 / DL#232 hook).
export { validate } from './validators/policy-file-validator.js';
