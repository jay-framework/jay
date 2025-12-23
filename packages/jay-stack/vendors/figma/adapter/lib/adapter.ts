import { VendorAdapter, ContractContext } from '@jay-framework/dev-server';
import { FigmaInterchangeDoc } from '@jay-framework/figma-interchange';
import { FigmaToJayConverter } from './converter';

export class FigmaAdapter implements VendorAdapter<FigmaInterchangeDoc> {
    readonly vendorId = 'figma';

    async convert(data: FigmaInterchangeDoc, contractContext: ContractContext): Promise<string> {
        // 1. Validate vendor
        if (data.vendor !== 'figma') {
            throw new Error('Invalid vendor data');
        }

        // 2. Validate views exist
        if (!data.views || Object.keys(data.views).length === 0) {
            throw new Error('No views found in design document');
        }

        // 3. Select primary view (prefer desktop, fall back to first available)
        // TODO: Implement proper multi-view handling (responsive breakpoints)
        const viewKeys = Object.keys(data.views);
        const preferredOrder = ['desktop', 'desktop-wide', 'tablet', 'mobile'];
        const mainViewKey = preferredOrder.find((k) => data.views[k]) || viewKeys[0];
        const mainView = data.views[mainViewKey];

        console.log(`🎨 Converting view: ${mainViewKey}`);

        // 4. Convert to Jay HTML with contract context
        const converter = new FigmaToJayConverter();
        return converter.process(mainView, contractContext);
    }

    validate(data: FigmaInterchangeDoc): boolean {
        // Schema validation: must have figma vendor and at least one view
        if (!data || data.vendor !== 'figma') {
            return false;
        }
        return !!(data.views && Object.keys(data.views).length > 0);
    }
}
