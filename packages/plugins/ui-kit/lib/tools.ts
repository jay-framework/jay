// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces. The agent-kit generator is a
// tools primitive (loaded via `./tools` by `jay-stack agent-kit`), never from the serve entry (`.`).
export { generateUiKitAgentKit } from './agentkit';
