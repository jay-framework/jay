// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces. CLI commands are a tools
// primitive (loaded via `./tools` by `jay-stack run`), never from the serve entry (`.`).
export { generateSchema, generateSchemaCommand } from './generate-schema.js';
