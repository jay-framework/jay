// Serve entry (DL#179): must stay compiler-free. Only the production `fontFallback` action lives
// here — it uses @capsizecss, not the compiler. All tools-time surfaces (validators, agent-kit,
// devOnly settings actions, settings page) live in `./tools` (lib/tools.ts).
export { fontFallback } from './actions/font-fallback.js';
