import { Counter, CounterProps } from './counter';
import { sandboxRoot, SecureReferencesManager } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [a]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [
            sandboxChildComp<any, CounterProps, any, any, any>(
                Counter,
                (vs) => ({ title: 'first counter', initialCount: 12 }),
                a(),
            ),
        ];
    });
}
