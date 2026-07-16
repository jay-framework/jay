import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps()
    .withFastRender(async () =>
        phaseOutput(
            {
                markdownSource:
                    '# Live Markdown\n\nThis is **dynamically rendered** markdown.\n\n- Item one\n- Item two\n',
            },
            {},
        ),
    );
