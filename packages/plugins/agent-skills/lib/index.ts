// Serve entry (DL#179): must stay compiler-free. This plugin is toolchain-only — its whole surface
// (the publish-skills CLI command + the agent-skills validator) lives in `./tools` (lib/tools.ts).
// The serve entry is intentionally empty.
export {};
