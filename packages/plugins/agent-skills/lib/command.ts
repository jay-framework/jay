/**
 * `jay-stack run agent-skills/publish-skills` (DL#216).
 *
 * Packages authored skills (folder mode `src/skills/`, or `--config <file>` for curated publishing)
 * into `public/.well-known/agent-skills/` with fresh `sha256:` digests. Surfaced to dev-time agents
 * via agent-kit (developer/publish-skills-guide.md).
 */
import * as path from 'node:path';
import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import { publishSkills } from './publish.js';

export const publishSkillsCommand = makeCliCommand('publish-skills')
    .withServices(CONSOLE_CONTEXT)
    .withHandler(
        async (
            input: { folder?: string; config?: string },
            console: import('@jay-framework/fullstack-component').ConsoleContext,
        ) => {
            try {
                const result = await publishSkills({
                    projectRoot: console.projectRoot,
                    publicFolder: console.publicFolder,
                    folder: input.folder
                        ? path.resolve(console.projectRoot, input.folder)
                        : undefined,
                    config: input.config
                        ? path.resolve(console.projectRoot, input.config)
                        : undefined,
                    log: (msg) => console.log(msg),
                });

                if (result.skills.length === 0) {
                    console.warn(
                        'No skills found. Author skills under src/skills/<name>/SKILL.md (or pass --config <file>).',
                    );
                }
                return { success: true };
            } catch (err: any) {
                console.error(`publish-skills failed: ${err.message}`);
                return { success: false };
            }
        },
    );
