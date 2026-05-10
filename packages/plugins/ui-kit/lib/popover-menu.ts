import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import type { PopoverMenuContract, PopoverMenuRefs } from './popover-menu.jay-contract';
import { Props } from '@jay-framework/component';

const supportsAnchor = typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--x');

export const popoverMenu = makeJayStackComponent<PopoverMenuContract>()
    .withProps<{}>()
    .withInteractive(function PopoverMenu(props: Props<{}>, refs: PopoverMenuRefs) {
        let closeTimer: ReturnType<typeof setTimeout> | null = null;

        function cancelClose() {
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
        }

        function scheduleClose() {
            cancelClose();
            closeTimer = setTimeout(() => {
                refs.popover.exec$((el) => {
                    el.hidePopover();
                });
                closeTimer = null;
            }, 150);
        }

        refs.trigger.onmouseenter(async () => {
            cancelClose();
            if (!supportsAnchor) {
                const rect = await refs.trigger.exec$((el) => {
                    return el.getBoundingClientRect();
                });
                refs.popover.exec$((el) => {
                    el.style.position = 'fixed';
                    el.style.inset = 'unset';
                    el.style.margin = '0';
                    el.style.top = `${rect.bottom}px`;
                    el.style.left = `${rect.left}px`;
                });
            }
            refs.popover.exec$((el) => {
                el.showPopover();
            });
        });

        refs.trigger.onmouseleave(() => {
            scheduleClose();
        });

        refs.popover.onmouseenter(() => {
            cancelClose();
        });

        refs.popover.onmouseleave(() => {
            scheduleClose();
        });

        return { render: () => ({}) };
    });
