import { execFile, execFileSync } from 'node:child_process';

/**
 * The single seam through which share talks to git (DL#237 § "Git runner").
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
        /** git stopped responding and was killed (e.g. a credential helper waiting on a dialog). */
        readonly timedOut = false,
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
    /** Kill a git call that runs longer than this (default GIT_TIMEOUT_MS). */
    timeoutMs?: number;
}

/**
 * Prompts are disabled, but a credential helper (e.g. osxkeychain waiting for a Keychain dialog)
 * can still block forever; a share action must fail fast instead (DL#237 QA).
 */
export const GIT_TIMEOUT_MS = 60_000;

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
    const timeoutMs = options.timeoutMs ?? GIT_TIMEOUT_MS;
    let sshCommand: Promise<string> | undefined;

    const exec = (args: string[], cwd: string, env: NodeJS.ProcessEnv) =>
        new Promise<string>((resolve, reject) => {
            let timedOut = false;
            const child = execFile(
                'git',
                args,
                { cwd, env, maxBuffer: 64 * 1024 * 1024 },
                (err, stdout, stderr) => {
                    clearTimeout(timer);
                    if (timedOut) reject(stalledGitError(args, timeoutMs));
                    else if (err) reject(new GitCommandError(args, String(stderr || err.message)));
                    else resolve(String(stdout).trimEnd());
                },
            );
            const timer = setTimeout(() => {
                timedOut = true;
                killProcessTree(child.pid);
            }, timeoutMs);
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

function stalledGitError(args: string[], timeoutMs: number): GitCommandError {
    return new GitCommandError(
        args,
        `git did not respond within ${Math.round(timeoutMs / 1000)}s and was stopped ` +
            '(usually a credential helper waiting for a login or Keychain dialog).',
        true,
    );
}

/** Kills git and every helper it started — a stuck helper outlives a kill of git alone. */
function killProcessTree(rootPid: number | undefined): void {
    if (rootPid === undefined) return;
    for (const pid of [...descendantsOf(rootPid), rootPid]) {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // Already exited.
        }
    }
}

function descendantsOf(rootPid: number): number[] {
    const children = new Map<number, number[]>();
    for (const line of execFileSync('ps', ['-axo', 'pid=,ppid=']).toString().split('\n')) {
        const [pid, ppid] = line.trim().split(/\s+/).map(Number);
        if (pid && ppid) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
    }
    const found: number[] = [];
    const visit = (pid: number) =>
        (children.get(pid) ?? []).forEach((child) => {
            found.push(child);
            visit(child);
        });
    visit(rootPid);
    return found;
}
