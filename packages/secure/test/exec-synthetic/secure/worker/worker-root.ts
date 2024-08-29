import { Comp, CompProps } from './comp';
import { sandboxRoot, SecureReferencesManager} from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [comp1]] =
            SecureReferencesManager.forSandboxRoot([], [], ['comp1'], [])
        return [
            sandboxChildComp<any, CompProps, any, any, any>(Comp, (vs) => ({}), comp1()),
        ]
    });
}
