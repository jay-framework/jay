import yourPlugin from '../lib';
import pluginTester from "babel-plugin-tester";

pluginTester({
    plugin: yourPlugin,
    pluginName: 'identifier reverse',
    tests: {
        // the key is the title
        // the value is the code that is unchanged (because `snapshot: false`)
        // test title will be: `1. does not change code with no identifiers`
        'does not change code with no identifiers': '"hello";',

        // test title will be: `2. changes this code`
        'changes this code': {
            // input to the plugin
            code: 'var hello = "hi";',
            // expected output
            output: 'var olleh = "hi";',
        },
    },
})