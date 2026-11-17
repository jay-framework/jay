import { describe, it, expect } from 'vitest';
import { buildSshCommand, createGitRunner } from '../lib/core/git-runner';
import { createSandbox } from './harness';

describe('git runner — no prompts (DL221)', () => {
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
