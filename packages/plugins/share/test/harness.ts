import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { vi } from 'vitest';
import { createGitRunner, type GitRunner } from '../lib/core/git-runner';
import type { ShareContext } from '../lib/core/context';
import type { SetupRun } from '../lib/core/plugin-handlers';

export const REPO_URL = 'https://github.com/acme/brand-ds.git';
export const OTHER_REPO_URL = 'https://github.com/acme/other.git';
const FIXTURES = path.join(__dirname, 'fixtures');

/**
 * A sandbox with a site repo and local bare "GitHub" repos. Git never reads the user's global
 * config and never touches the network: GitHub URLs are rewritten to the bare repos.
 */
export interface Sandbox {
    root: string;
    site: string;
    env: NodeJS.ProcessEnv;
    bare(url: string): string;
    git(args: string[], cwd: string): string;
    ctx(overrides?: Partial<ShareContext>): ShareContext;
    setupSpy: ReturnType<typeof vi.fn<[string, string], Promise<SetupRun>>>;
    gitSpy: ReturnType<typeof vi.fn>;
    copyFixturePlugin(folder: string, fixture?: string): string;
    /** Clones `url` into a scratch "teammate" working copy. */
    teammateClone(url: string, branch?: string): string;
    commitFile(repoDir: string, file: string, content: string, message?: string): string;
    read(relPath: string): string;
}

export function createSandbox(): Sandbox {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jay-share-')));
    const gitConfig = path.join(root, 'gitconfig');
    fs.writeFileSync(
        gitConfig,
        '[user]\n\tname = Share Test\n\temail = share@test.invalid\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n',
    );
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: root,
        GIT_CONFIG_GLOBAL: gitConfig,
        GIT_CONFIG_NOSYSTEM: '1',
    };
    const bareRepos: Record<string, string> = {};
    const git = (args: string[], cwd: string) =>
        execFileSync('git', args, { cwd, env, encoding: 'utf-8' }).trim();

    const site = path.join(root, 'site');
    fs.mkdirSync(path.join(site, 'src', 'plugins'), { recursive: true });
    fs.writeFileSync(
        path.join(site, 'package.json'),
        JSON.stringify({ name: 'site', private: true }),
    );
    git(['init', '--quiet'], site);
    git(['add', '-A'], site);
    git(['commit', '--quiet', '-m', 'site'], site);

    const bare = (url: string) => {
        if (!bareRepos[url]) {
            const dir = path.join(root, 'remotes', `${Object.keys(bareRepos).length}.git`);
            fs.mkdirSync(dir, { recursive: true });
            git(['init', '--quiet', '--bare'], dir);
            bareRepos[url] = dir;
        }
        return bareRepos[url];
    };

    const setupSpy = vi.fn(async (_projectRoot: string, _folder: string): Promise<SetupRun> => ({
        setup: 'none',
    }));
    const gitSpy = vi.fn();
    const realRunner = createGitRunner({ urlRewrite: bareRepos, env });
    const runner: GitRunner = {
        resolveUrl: realRunner.resolveUrl,
        run: (args, cwd) => {
            gitSpy(args, cwd);
            return realRunner.run(args, cwd);
        },
    };

    let teammateCount = 0;
    return {
        root,
        site,
        env,
        bare,
        git,
        setupSpy,
        gitSpy,
        ctx: (overrides = {}) => ({
            projectRoot: site,
            git: runner,
            handlers: { runSetupAndAgentKit: setupSpy },
            validateLocalPlugins: async () => [],
            ...overrides,
        }),
        copyFixturePlugin(folder, fixture = 'brand-ds') {
            const target = path.join(site, 'src', 'plugins', folder);
            fs.cpSync(path.join(FIXTURES, fixture), target, { recursive: true });
            return target;
        },
        teammateClone(url, branch = 'main') {
            const dir = path.join(root, `teammate-${teammateCount++}`);
            git(['clone', '--quiet', '--branch', branch, bare(url), dir], root);
            return dir;
        },
        commitFile(repoDir, file, content, message = `edit ${file}`) {
            fs.mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
            fs.writeFileSync(path.join(repoDir, file), content);
            git(['add', '-A'], repoDir);
            git(['commit', '--quiet', '-m', message], repoDir);
            return git(['rev-parse', 'HEAD'], repoDir);
        },
        read: (relPath) => fs.readFileSync(path.join(site, relPath), 'utf-8'),
    };
}

/** Seeds `url` with the fixture plugin on `branch` (a plugin repo someone already published). */
export function seedPluginRepo(
    sandbox: Sandbox,
    url: string,
    branch = 'main',
    fixture = 'brand-ds',
): string {
    const work = path.join(sandbox.root, `seed-${Math.random().toString(36).slice(2)}`);
    fs.cpSync(path.join(FIXTURES, fixture), work, { recursive: true });
    sandbox.git(['init', '--quiet', '-b', branch], work);
    sandbox.git(['add', '-A'], work);
    sandbox.git(['commit', '--quiet', '-m', 'seed'], work);
    sandbox.git(['push', '--quiet', sandbox.bare(url), `HEAD:refs/heads/${branch}`], work);
    return sandbox.git(['rev-parse', 'HEAD'], work);
}

export function remoteBranchSha(sandbox: Sandbox, url: string, branch: string): string {
    const out = sandbox.git(['ls-remote', sandbox.bare(url), `refs/heads/${branch}`], sandbox.root);
    return out.split(/\s+/)[0] ?? '';
}

export function remoteRefs(sandbox: Sandbox, url: string): string {
    return sandbox.git(['ls-remote', sandbox.bare(url)], sandbox.root);
}

/** A site that has linked REPO_URL (`ref` branch) into src/plugins/brand-ds. */
export async function linkedSite(
    ref = 'main',
): Promise<{ sandbox: Sandbox; dir: string; sha: string }> {
    const { link } = await import('../lib/core/link');
    const sandbox = createSandbox();
    const sha = seedPluginRepo(sandbox, REPO_URL, ref);
    await link(sandbox.ctx(), { repo: REPO_URL, ref });
    sandbox.setupSpy.mockClear();
    return { sandbox, dir: path.join(sandbox.site, 'src', 'plugins', 'brand-ds'), sha };
}
