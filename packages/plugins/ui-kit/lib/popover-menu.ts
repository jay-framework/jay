import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import type { PopoverMenuContract, PopoverMenuRefs } from './popover-menu.jay-contract';
import { Props } from '@jay-framework/component';

const supportsAnchor =
    typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--x');

export const popoverMenu = makeJayStackComponent<PopoverMenuContract>()
    .withProps<{}>()
    .withInteractive(function PopoverMenu(props: Props<{}>, refs: PopoverMenuRefs) {
        refs.trigger.onmouseenter(async () => {
            if (!supportsAnchor) {
                const rect = await refs.trigger.exec$((el) => {
                    return el.getBoundingClientRect();
                });
                refs.popover.exec$(el => {
                    el.style.position = 'fixed';
                    el.style.inset = 'unset';
                    el.style.margin = '0';
                    el.style.top = `${rect.bottom}px`;
                    el.style.left = `${rect.left}px`;
                })

            }
            refs.popover.exec$((el) => {
                el.showPopover();
            });

        });

        return { render: () => ({}) };
    });
