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
    .withInteractive(function ScrollCarousel(props: Props<{}>, refs: ScrollCarouselRefs) {
        const [atStart, setAtStart] = createSignal(true);
        const [atEnd, setAtEnd] = createSignal(false);

        refs.prev.onclick(() => {
            refs.container.exec$((el) => scrollCarouselBy(el, -1));
        });

        refs.next.onclick(() => {
            refs.container.exec$((el) => scrollCarouselBy(el, 1));
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

/**
 * Scrolls one page of the carousel. Under prefers-reduced-motion it jumps (`'instant'`, not `'auto'`:
 * `'auto'` defers to CSS `scroll-behavior`, which may still be `smooth`). DL#238.
 */
export function scrollCarouselBy(el: HTMLElement, direction: 1 | -1): void {
    const reduce = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth, behavior: reduce ? 'instant' : 'smooth' });
}
