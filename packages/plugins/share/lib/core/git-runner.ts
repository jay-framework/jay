import { execFile } from 'node:child_process';

/**
 * The single seam through which share talks to git (DL#221 § "Git runner").
 * Plain `git` with the user's credentials; prompts are always disabled.
 */
export interface GitRunner {
    /** Runs `git <args>` in `cwd` and returns stdout without trailing whitespace; throws GitCommandError on failure. */
    run(args: string[], cwd: string): Promise<string>;
    /** The URL git actually uses for a user-facing repo URL (identity outside tests). */
    resolveUrl(repoUrl: string): string;
}

export class GitCommandError extends Error {
    constructor(
        readonly args: string[],
        readonly stderr: string,
    ) {
        super(`git ${args.join(' ')} failed: ${stderr.trim()}`);
        this.name = 'GitCommandError';
    }
}

export interface GitRunnerOptions {
    /** Test seam: maps a GitHub URL to a local bare repo path. Never exposed as a user flag. */
    urlRewrite?: Record<string, string>;
    /** Base environment (defaults to process.env). */
    env?: NodeJS.ProcessEnv;
}

const BATCH_MODE = '-o BatchMode=yes';

/** `GIT_SSH_COMMAND` that never prompts while keeping the user's own ssh options. */
export function buildSshCommand(envSshCommand?: string, coreSshCommand?: string): string {
    const base = envSshCommand?.trim() || coreSshCommand?.trim() || 'ssh';
    return `${base} ${BATCH_MODE}`;
}

export function createGitRunner(options: GitRunnerOptions = {}): GitRunner {
    const baseEnv = options.env ?? process.env;
    const urlRewrite = options.urlRewrite ?? {};
    const resolveUrl = (repoUrl: string) => urlRewrite[repoUrl] ?? repoUrl;
    let sshCommand: Promise<string> | undefined;

    const exec = (args: string[], cwd: string, env: NodeJS.ProcessEnv) =>
        new Promise<string>((resolve, reject) => {
            execFile(
                'git',
                args,
                { cwd, env, maxBuffer: 64 * 1024 * 1024 },
                (err, stdout, stderr) => {
                    if (err) reject(new GitCommandError(args, String(stderr || err.message)));
                    else resolve(String(stdout).trimEnd());
                },
            );
        });

    const resolveSshCommand = (cwd: string) => {
        sshCommand ??= exec(['config', '--get', 'core.sshCommand'], cwd, baseEnv)
            .catch(() => '')
            .then((core) => buildSshCommand(baseEnv.GIT_SSH_COMMAND, core));
        return sshCommand;
    };

    return {
        resolveUrl,
        async run(args, cwd) {
            const env: NodeJS.ProcessEnv = {
                ...baseEnv,
                GIT_TERMINAL_PROMPT: '0',
                GCM_INTERACTIVE: 'never',
                GIT_SSH_COMMAND: await resolveSshCommand(cwd),
            };
            return exec(args.map(resolveUrl), cwd, env);
        },
    };
}
