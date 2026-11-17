import { describe, it, expect } from 'vitest';
import { ServiceNotRegisteredError } from '@jay-framework/stack-server-runtime';
import { describeInitAfterSetupFailure } from '../lib/init-after-setup-message';

describe('describeInitAfterSetupFailure', () => {
    /**
     * Bug: for every plugin whose dependency is not configured yet, setup printed
     * "Init after setup: Service '…' not found. Did you register it in jay.init.ts?".
     * Found in: design-log/235 - boolean attributes and fresh-project validation.md
     * Expected: name the missing service and say its plugin is probably not configured yet.
     */
    it('explains a missing service as an unconfigured provider plugin', () => {
        expect(
            describeInitAfterSetupFailure(
                new ServiceNotRegisteredError('jay:service:PaymentClient'),
            ),
        ).toEqual(
            "Services not initialized yet: this plugin needs service 'jay:service:PaymentClient', which is " +
                'not registered — the plugin that provides it is probably not configured yet. ' +
                'Configure it, then re-run setup.',
        );
    });

    it('passes other init errors through', () => {
        expect(describeInitAfterSetupFailure(new Error('boom'))).toEqual('Init after setup: boom');
    });
});
