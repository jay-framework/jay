import { describe, it, expect } from 'vitest';
import { createJayService } from '@jay-framework/fullstack-component';
import {
    clearServiceRegistry,
    getService,
    isServiceNotRegisteredError,
    registerService,
    ServiceNotRegisteredError,
} from '../lib/services';

function captureError(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('expected the action to throw');
}

describe('getService', () => {
    it('returns a registered service', () => {
        clearServiceRegistry();
        const marker = createJayService<{ ok: boolean }>('Registered');
        registerService(marker, { ok: true });
        expect(getService(marker)).toEqual({ ok: true });
    });

    /**
     * Bug: setup printed "Service '…' not found. Did you register it in jay.init.ts?" for every plugin
     * whose dependency plugin was simply not configured yet — it reads like a code bug.
     * Found in: design-log/235 - boolean attributes and fresh-project validation.md
     * Expected: a typed error naming the service and pointing at an unconfigured plugin as the likely cause.
     */
    it('throws ServiceNotRegisteredError naming the service and the unconfigured-plugin cause', () => {
        clearServiceRegistry();
        const marker = createJayService<object>('PaymentClient');
        const error = captureError(() => getService(marker));

        expect(error).toBeInstanceOf(ServiceNotRegisteredError);
        expect(isServiceNotRegisteredError(error)).toBe(true);
        expect((error as ServiceNotRegisteredError).serviceName).toEqual(
            'jay:service:PaymentClient',
        );
        expect((error as Error).message).toEqual(
            "Service 'jay:service:PaymentClient' is not registered. Services are registered by a plugin's " +
                "server init or by the project's jay.init.ts — if 'jay:service:PaymentClient' comes from a " +
                'plugin, that plugin may not be configured yet (run `jay-stack setup`). To register it ' +
                'in jay.init.ts: registerService(PAYMENT_CLIENT_SERVICE, ...)',
        );
    });

    it('recognizes the error by name across module copies, not only by instanceof', () => {
        const foreign = Object.assign(new Error('x'), {
            name: 'ServiceNotRegisteredError',
            serviceName: 'jay:service:Other',
        });
        expect(isServiceNotRegisteredError(foreign)).toBe(true);
        expect(isServiceNotRegisteredError(new Error('x'))).toBe(false);
    });
});
