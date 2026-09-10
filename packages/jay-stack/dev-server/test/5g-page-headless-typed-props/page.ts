import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import {
    ReqStatus,
    type PageContract,
    type PageSlowViewState,
    type PageFastViewState,
} from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Typed Props' }, {}),
    )
    .withFastRender(async () =>
        phaseOutput<PageFastViewState, {}>(
            { reqStatus: ReqStatus.success, reqCount: 9, reqActive: true },
            {},
        ),
    );
