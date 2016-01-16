// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
'use strict';
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { IGhcMod, GhcModOpts } from '../src/ghcModInterfaces';
import { TestLogger } from './helpers/TestLogger';
import { InteractiveGhcModProcess } from '../src/interactiveGhcMod';

// Defines a Mocha test suite to group tests of similar kind together
describe('InteractiveGhcModProcess', function() {
    this.timeout(0);

    let logger = new TestLogger();
    let ghcMod: IGhcMod;
    let uri: string = 'test/examples/empty.hs';

    before(() => {
        ghcMod = new InteractiveGhcModProcess(logger);
    });

    after(() => {
        ghcMod.killProcess();
    });


    describe('#runGhcModCommand', () => {
        it('should return diagnostics', () => {
            let opts = <GhcModOpts>{
                command: 'check',
                text: '',
                uri: uri
            };
            return ghcMod.runGhcModCommand(opts).then((lines) => {
                assert.equal(lines.length, 1);
            });
        });

        it('should return diagnostics for an empty file', () => {
            let opts = <GhcModOpts>{
                command: 'check',
                uri: uri
            };
            let regex = /test\\examples\\empty.hs:\d+:\d+:The IO action `main' is not defined in module `Main'/;
            return ghcMod.runGhcModCommand(opts).then((lines) => {
                assert.ok(regex.test(lines[0]));
            });
        });
    });
});
