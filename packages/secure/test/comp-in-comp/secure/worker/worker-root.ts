import { Parent, ParentProps } from './parent';
import { sandboxRoot, SecureReferencesManager} from '../../../../lib';
import { sandboxChildComp } from '../../../../lib';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [comp1]] =
            SecureReferencesManager.forSandboxRoot([], [], ['comp1'], [])
        return [sandboxChildComp(Parent, (vs) => ({}), comp1())]
    });
}
