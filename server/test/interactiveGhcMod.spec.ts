// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
'use strict';
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { IGhcMod, GhcModCmdOpts } from '../src/interfaces';
import { TestLogger } from './helpers/testLogger';
import { InteractiveGhcModProcess } from '../src/ghcModProviders/interactiveGhcMod';

// Defines a Mocha test suite to group tests of similar kind together
// *******************************************************************************
// NOTE: Editing this file with wallabyjs running will start too many processes //
// *******************************************************************************
describe('InteractiveGhcModProcess', function(): void {
    this.timeout(0);

    let logger = new TestLogger();
    let ghcMod: IGhcMod = InteractiveGhcModProcess.create(null, logger);

    after(() => {
        ghcMod.killProcess();
    });

    describe('#runGhcModCommand', () => {
        describe('Check command', () => {
            let regex = /.+:\d+:\d+:(Warning: |Error: )?.+/;

            it('should return an empty array for valid files', () => {
                let uri: string = 'test/fixtures/valid.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'check',
                    uri: uri
                };
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.equal(lines.length, 0);
                });
            });

            it('should return messages without severity in an expected format', () => {
                let uri: string = 'test/fixtures/empty.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'check',
                    uri: uri
                };
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.equal(lines.length, 1);
                    assert.ok(regex.test(lines[0]));
                });
            });

            it('should return warnings in an expected format', () => {
                let uri: string = 'test/fixtures/type.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'check',
                    uri: uri
                };
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.equal(lines.length, 1);
                    assert.ok(regex.test(lines[0]));
                });
            });
        });

        describe('Type command', () => {
            it('should return the expected output', () => {
                let uri: string = 'test/fixtures/type.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'type',
                    uri: uri,
                    args: ['3', '8']
                };
                let output = [
                    '3 8 3 9 "a"',
                    '3 1 3 17 "a -> a"'
                ];
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.deepEqual(lines, output);
                });
            });
        });

        describe('Info command', () => {
            it('should return "Cannot show info" if info unavailable', () => {
                let uri: string = 'test/fixtures/type.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'info',
                    uri: uri,
                    args: ['bogus']
                };
                let output = ['Cannot show info'];
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.deepEqual(lines, output);
                });
            });

            it('should return info if available', () => {
                let uri: string = 'test/fixtures/type.hs';
                let opts = <GhcModCmdOpts>{
                    command: 'info',
                    uri: uri,
                    args: ['Num']
                };
                return ghcMod.runGhcModCommand(opts).then((lines) => {
                    assert.equal(lines.length, 1);
                    assert.equal(lines[0].indexOf('Cannot show info'), -1);
                });
            });
        });
    });
});
