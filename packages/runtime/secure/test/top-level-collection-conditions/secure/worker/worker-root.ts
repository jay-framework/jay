import { Counter } from './counter';
import { sandboxRoot, SecureReferencesManager } from '../../../../lib/';
import { sandboxChildComp, sandboxCondition, sandboxForEach } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [comp1, comp2]] = SecureReferencesManager.forSandboxRoot(
            [],
            [],
            ['comp1'],
            ['comp2'],
        );
        return [
            sandboxCondition(
                (vs) => vs.cond,
                [
                    sandboxChildComp(
                        Counter,
                        (vs) => ({
                            title: 'conditional counter',
                            initialCount: vs.initialCount,
                            id: 'cond',
                        }),
                        comp1(),
                    ),
                ],
            ),
            sandboxForEach<any, any>(
                (vs) => vs.subCounters,
                'id',
                () => [
                    sandboxChildComp(
                        Counter,
                        (vs: any) => ({
                            title: `collection counter ${vs.id}`,
                            initialCount: vs.initialCount,
                            id: vs.id,
                        }),
                        comp2(),
                    ),
                ],
            ),
        ];
    });
}
