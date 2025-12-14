import { InterchangeNode, InterchangeFrame, InterchangeText, InterchangeRectangle, InterchangeInstance } from '@jay-framework/figma-interchange';

export class FigmaToJayConverter {
    process(node: InterchangeNode): string {
        return this.convertNode(node, 0);
    }

    private convertNode(node: InterchangeNode, depth: number): string {
        const indent = '  '.repeat(depth);
        
        // Handle Directives
        const directives = this.getDirectives(node);
        const bindings = this.getBindings(node);
        
        let tagName = 'div';
        let attributes = `class="${this.getClassName(node)}"`;
        let content = '';
        let closing = '';
        
        if (node.jayData?.semanticTag) {
            tagName = node.jayData.semanticTag;
        } else if (node.type === 'TEXT') {
            tagName = 'span';
        }

        // Apply bindings
        if (bindings.length > 0) {
            // Simplified binding application
            bindings.forEach(b => {
                 attributes += ` j-bind:${b.targetProperty}="${b.contractProperty}"`;
            });
        }
        
        // Apply directives
        if (directives.length > 0) {
             directives.forEach(d => {
                 if (d.type === 'if') attributes += ` j-if="${d.expression}"`;
                 if (d.type === 'for') attributes += ` j-for="${d.variable} of ${d.expression}"`;
             });
        }

        // Specific Node Handling
        switch (node.type) {
            case 'FRAME':
            case 'COMPONENT':
            case 'INSTANCE':
                const frame = node as InterchangeFrame;
                if (frame.children) {
                    content = '\n' + frame.children.map(c => this.convertNode(c, depth + 1)).join('\n') + '\n' + indent;
                }
                break;
            case 'TEXT':
                const text = node as InterchangeText;
                content = text.characters;
                // Bind content if there's a j-text equivalent or just raw text
                // Check if binding targets 'characters' or 'text'
                if (bindings.find(b => b.targetProperty === 'characters' || b.targetProperty === 'text')) {
                     // j-text is usually simpler
                     const bind = bindings.find(b => b.targetProperty === 'characters' || b.targetProperty === 'text');
                     if (bind) {
                         attributes += ` j-text="${bind.contractProperty}"`;
                         content = ''; // Clear content if bound
                     }
                }
                break;
            case 'RECTANGLE':
                // div is fine
                break;
        }

        // Styles (Layout, Visuals)
        // Ideally we generate a CSS class or inline styles. 
        // For simplicity, let's just generate a style attribute for now or skip it.
        // attributes += ` style="..."`; 

        return `${indent}<${tagName} ${attributes}>${content}</${tagName}>`;
    }

    private getDirectives(node: InterchangeNode) {
        return node.jayData?.directives || [];
    }

    private getBindings(node: InterchangeNode) {
        return node.jayData?.bindings || [];
    }

    private getClassName(node: InterchangeNode) {
        // Sanitize name to be a class
        return node.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    }
}

