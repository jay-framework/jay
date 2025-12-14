import { VendorAdapter } from '@jay-framework/dev-server';
import { FigmaInterchangeDoc } from '@jay-framework/figma-interchange';
import { FigmaToJayConverter } from './converter';

export class FigmaAdapter implements VendorAdapter {
    readonly vendorId = 'figma';

    async convert(data: any): Promise<string> {
        // Validate payload type
        const doc = data as FigmaInterchangeDoc;
        
        // 1. Validate version (basic check)
        if (doc.vendor !== 'figma') {
            throw new Error('Invalid vendor data');
        }

        // 2. Instantiate Converter Engine
        const converter = new FigmaToJayConverter();
        return converter.process(doc.root);
    }

    validate(data: any): boolean {
        // Basic schema validation
        return data && data.vendor === 'figma' && data.root;
    }
}

