// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded by `jay-stack validate` via the `./tools` export; never by the serve path.
export { validate } from './validators/seo-validator.js';
