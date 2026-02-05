import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getLogger,
    setLogger,
    resetLogger,
    createLogger,
    createDevLogger,
    type JayLogger,
} from '../lib/index';

describe('logger', () => {
    beforeEach(() => {
        resetLogger();
    });

    describe('getLogger/setLogger', () => {
        it('returns default logger initially', () => {
            const log = getLogger();
            expect(log).toBeDefined();
            expect(log.info).toBeInstanceOf(Function);
            expect(log.error).toBeInstanceOf(Function);
            expect(log.warn).toBeInstanceOf(Function);
            expect(log.important).toBeInstanceOf(Function);
        });

        it('setLogger replaces the logger', () => {
            const mockLog: JayLogger = {
                important: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };

            setLogger(mockLog);
            const log = getLogger();

            log.info('test');
            expect(mockLog.info).toHaveBeenCalledWith('test');
        });

        it('resetLogger restores default', () => {
            const mockLog: JayLogger = {
                important: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };

            setLogger(mockLog);
            resetLogger();

            // Should not use the mock anymore
            const log = getLogger();
            log.info('test');
            expect(mockLog.info).not.toHaveBeenCalled();
        });
    });

    describe('createLogger', () => {
        it('silent level suppresses important and warn', () => {
            const log = createLogger('silent');
            const consoleSpy = vi.spyOn(console, 'log');
            const warnSpy = vi.spyOn(console, 'warn');

            log.important('test');
            log.warn('test');

            expect(consoleSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
            warnSpy.mockRestore();
        });

        it('info level shows important but not info', () => {
            const log = createLogger('info');
            const consoleSpy = vi.spyOn(console, 'log');

            log.info('should be hidden');
            expect(consoleSpy).not.toHaveBeenCalled();

            log.important('should be shown');
            expect(consoleSpy).toHaveBeenCalledWith('should be shown');

            consoleSpy.mockRestore();
        });

        it('verbose level shows info', () => {
            const log = createLogger('verbose');
            const consoleSpy = vi.spyOn(console, 'log');

            log.info('should be shown');
            expect(consoleSpy).toHaveBeenCalledWith('should be shown');

            consoleSpy.mockRestore();
        });
    });

    describe('createDevLogger', () => {
        it('creates logger with startRequest method', () => {
            const log = createDevLogger('info');
            expect(log.startRequest).toBeInstanceOf(Function);
        });

        it('startRequest returns timing interface', () => {
            const log = createDevLogger('info');
            const timing = log.startRequest('GET', '/test');

            expect(timing.recordViteSsr).toBeInstanceOf(Function);
            expect(timing.recordParams).toBeInstanceOf(Function);
            expect(timing.recordSlowRender).toBeInstanceOf(Function);
            expect(timing.recordFastRender).toBeInstanceOf(Function);
            expect(timing.recordViteClient).toBeInstanceOf(Function);
            expect(timing.end).toBeInstanceOf(Function);
        });
    });
});
