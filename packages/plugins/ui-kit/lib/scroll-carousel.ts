import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type {
    ScrollCarouselContract,
    ScrollCarouselRefs,
    ScrollCarouselFastViewState,
} from './scroll-carousel.jay-contract';
import { Props, createSignal } from '@jay-framework/component';

export const scrollCarousel = makeJayStackComponent<ScrollCarouselContract>()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput<ScrollCarouselFastViewState, {}>({ atStart: true, atEnd: false }, {}),
    )
    .withClientDefaults(() => ({
        viewState: { atStart: true, atEnd: false },
    }))
    .withInteractive(function ScrollCarousel(props: Props<{}>, refs: ScrollCarouselRefs) {
        const [atStart, setAtStart] = createSignal(true);
        const [atEnd, setAtEnd] = createSignal(false);

        refs.prev.onclick(() => {
            refs.container.exec$((el) => {
                el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
            });
        });

        refs.next.onclick(() => {
            refs.container.exec$((el) => {
                el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
            });
        });

        const updateScrollState = () => {
            refs.container.exec$((el) => {
                setAtStart(el.scrollLeft <= 0);
                setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
            });
        };

        refs.container.onscroll(updateScrollState);

        return {
            render: () => ({
                atStart: atStart(),
                atEnd: atEnd(),
            }),
        };
    });
