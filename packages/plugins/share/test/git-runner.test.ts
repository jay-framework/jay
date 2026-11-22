import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { buildSshCommand, createGitRunner, GitCommandError } from '../lib/core/git-runner';
import { networkFailure } from '../lib/core/report';
import { createSandbox } from './harness';

describe('git runner — no prompts (DL#237)', () => {
    it('appends BatchMode to ssh, the caller command, or core.sshCommand', () => {
        expect(buildSshCommand(undefined, undefined)).toEqual('ssh -o BatchMode=yes');
        expect(buildSshCommand('ssh -i k', undefined)).toEqual('ssh -i k -o BatchMode=yes');
        expect(buildSshCommand(undefined, 'ssh -p 2222')).toEqual('ssh -p 2222 -o BatchMode=yes');
        expect(buildSshCommand('ssh -i k', 'ssh -p 2222')).toEqual('ssh -i k -o BatchMode=yes');
    });

    it('runs git with prompts disabled and core.sshCommand kept', async () => {
        const sandbox = createSandbox();
        sandbox.git(['config', 'core.sshCommand', 'ssh -p 2222'], sandbox.site);
        const git = createGitRunner({ env: sandbox.env });
        const env = await git.run(['-c', 'alias.e=!env', 'e'], sandbox.site);
        const lines = env.split('\n');
        expect(
            lines
                .filter((l) => /^(GIT_TERMINAL_PROMPT|GCM_INTERACTIVE|GIT_SSH_COMMAND)=/.test(l))
                .sort(),
        ).toEqual([
            'GCM_INTERACTIVE=never',
            'GIT_SSH_COMMAND=ssh -p 2222 -o BatchMode=yes',
            'GIT_TERMINAL_PROMPT=0',
        ]);
    });

    it('rewrites only the configured URLs (test seam)', () => {
        const git = createGitRunner({ urlRewrite: { 'https://github.com/a/b.git': '/tmp/b.git' } });
        expect(git.resolveUrl('https://github.com/a/b.git')).toEqual('/tmp/b.git');
        expect(git.resolveUrl('https://github.com/a/c.git')).toEqual('https://github.com/a/c.git');
    });
});

/**
 * Bug: Import from an HTTPS GitHub URL hung forever in QA.
 * Found in: DL#237 / aiditor QA (2026-11-17). Root cause: the osxkeychain credential helper waits
 * on a macOS Keychain dialog; GIT_TERMINAL_PROMPT / GCM_INTERACTIVE do not cover it.
 * Expected: a git call that stops responding fails fast with a clear error and leaves no
 * orphaned child process (the helper outlives a plain kill of git).
 * Actual: execFile had no timeout, so the share action never returned.
 */
describe('git runner — stalled git (DL#237 QA)', () => {
    it('fails with a timeout error and kills the whole process tree', async () => {
        const sandbox = createSandbox();
        const marker = `share-stall-${process.pid}-${Date.now()}`;
        const git = createGitRunner({ env: sandbox.env, timeoutMs: 300 });
        const started = Date.now();
        const error = await git
            .run(['-c', `alias.stall=!sh -c 'sleep 30; echo ${marker}' &&:`, 'stall'], sandbox.site)
            .catch((e) => e);
        expect(error).toBeInstanceOf(GitCommandError);
        expect(error.timedOut).toEqual(true);
        expect(Date.now() - started).toBeLessThan(5000);
        await new Promise((r) => setTimeout(r, 200));
        expect(execSync('ps -axo command').toString().includes(marker)).toEqual(false);
    });

    it('classifies a timeout as no access and suggests the SSH URL', () => {
        const report = networkFailure(
            new GitCommandError(['clone'], 'stalled', true),
            'clone',
            'Could not clone https://github.com/acme/brand-ds (main)',
        ).report;
        expect(report).toMatchObject({
            code: 'SHARE_NO_ACCESS',
            message: 'Could not clone https://github.com/acme/brand-ds (main): stalled',
            nextStep:
                'Use the SSH URL (git@github.com:<owner>/<name>.git) if your ssh key has access, or make sure ' +
                'git can reach the HTTPS URL from a terminal without asking for credentials, then retry.',
        });
    });
});
