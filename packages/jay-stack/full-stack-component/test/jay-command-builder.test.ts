import { describe, it, expect } from 'vitest';
import {
    makeCliCommand,
    isJayCliCommand,
    CONSOLE_CONTEXT,
    type ConsoleContext,
} from '../lib/jay-command-builder';
import { createJayService } from '../lib/jay-stack-types';

describe('makeCliCommand builder', () => {
    it('should create a command with name and handler', () => {
        const cmd = makeCliCommand('test-cmd').withHandler(async () => ({ success: true }));

        expect(cmd.commandName).toBe('test-cmd');
        expect(cmd._brand).toBe('JayCliCommand');
        expect(typeof cmd.handler).toBe('function');
    });

    it('should accept services', () => {
        interface TestService {
            doWork(): void;
        }
        const TEST_SERVICE = createJayService<TestService>('TestService');

        const cmd = makeCliCommand('test-cmd')
            .withServices(TEST_SERVICE)
            .withHandler(async (_input: {}, _svc) => ({ success: true }));

        expect(cmd.services).toHaveLength(1);
    });

    it('should accept multiple services including CONSOLE_CONTEXT', () => {
        interface MyService {
            fetch(): Promise<void>;
        }
        const MY_SERVICE = createJayService<MyService>('MyService');

        const cmd = makeCliCommand('deploy')
            .withServices(MY_SERVICE, CONSOLE_CONTEXT)
            .withHandler(async (_input: { env: string }, _mySvc, _console) => ({
                success: true,
            }));

        expect(cmd.services).toHaveLength(2);
        expect(cmd.commandName).toBe('deploy');
    });

    it('should execute handler and return result', async () => {
        const cmd = makeCliCommand('test').withHandler(async (input: { value: number }) => ({
            success: input.value > 0,
        }));

        const result = await cmd.handler({ value: 5 });
        expect(result).toEqual({ success: true });

        const failResult = await cmd.handler({ value: -1 });
        expect(failResult).toEqual({ success: false });
    });
});

describe('isJayCliCommand', () => {
    it('should return true for CLI commands', () => {
        const cmd = makeCliCommand('test').withHandler(async () => ({ success: true }));
        expect(isJayCliCommand(cmd)).toBe(true);
    });

    it('should return false for non-commands', () => {
        expect(isJayCliCommand(null)).toBe(false);
        expect(isJayCliCommand(undefined)).toBe(false);
        expect(isJayCliCommand({})).toBe(false);
        expect(isJayCliCommand({ _brand: 'JayAction' })).toBe(false);
        expect(isJayCliCommand('string')).toBe(false);
    });
});
