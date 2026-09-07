// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces. The setup handler is a tools
// primitive (loaded via `./tools` by `jay-stack setup`), never from the serve entry (`.`).
export { setupGeminiAgent } from './setup';
