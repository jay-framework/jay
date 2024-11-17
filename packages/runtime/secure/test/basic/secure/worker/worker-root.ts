import { Basic, BasicProps } from './basic';
import { sandboxRoot, SecureReferencesManager } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [comp1]] = SecureReferencesManager.forSandboxRoot([], [], ['comp1'], []);
        return [
            sandboxChildComp<any, BasicProps, any, any, any>(
                Basic,
                (vs) => ({ safe: '', firstName: vs.firstName, lastName: vs.lastName }),
                comp1(),
            ),
        ];
    });
}
