import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import type { PopoverMenuContract, PopoverMenuRefs } from './popover-menu.jay-contract';
import { Props } from '@jay-framework/component';

export const popoverMenu = makeJayStackComponent<PopoverMenuContract>()
    .withProps<{}>()
    .withInteractive(function PopoverMenu(props: Props<{}>, refs: PopoverMenuRefs) {
        refs.trigger.onmouseenter(() => {
            refs.popover.exec$((el) => el.showPopover());
        });

        return { render: () => ({}) };
    });
