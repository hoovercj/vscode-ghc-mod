import * as assert from 'assert';
import { TestLogger } from './helpers/testLogger';
import { TestGhcMod } from './helpers/testGhcMod';
import { IGhcMod, IGhcModProvider, ILogger } from '../src/interfaces';
import { GhcModProvider } from '../src/ghcModProviders/ghcModProvider';

import { DiagnosticSeverity, Position, Range } from 'vscode-languageserver';

describe('GhcModProvider', () => {
    describe('#doCheck', () => {
        it ('should return an empty array if the file is fine', () => {
            let ghcModOutput = ['OK'];
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod, '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.equal(diagnostics.length, 0);
            });
        });

        it ('should return one diagnostic for each ghc-mod issue', () => {
            let ghcModOutput = [
                'A.hs:5:7:Not in scope: `a`',
                'A.hs:5:11:Not in scope: `b`',
                'A.hs:5:15:Not in scope: `c`'];
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod, '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.equal(diagnostics.length, 3);
            });
        });

        it ('should return diagnostics with proper message', () => {
            let ghcModOutput = ['A.hs:5:7:Not in scope: `a`'];
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod, '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.equal(diagnostics[0].message, 'Not in scope: `a`');
            });
        });

        it ('should return diagnostics with proper range', () => {
            let ghcModOutput = ['A.hs:5:7:Not in scope: `a`'];
            let range = Range.create(4, 6, 4, 6);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod, '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.deepEqual(diagnostics[0].range, range);
            });
        });

        it ('should return diagnostics with severity Error if none present', () => {
            let ghcModOutput = ['A.hs:5:7:Not in scope: `a`'];
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.equal(diagnostics[0].severity, DiagnosticSeverity.Error);
            });
        });

        it ('should return diagnostics with severity Warning if warning present', () => {
            let ghcModOutput = ['A.hs:5:7:Warning: Not in scope: `a`'];
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger);
            return provider.doCheck(null, null, false).then((diagnostics) => {
                assert.equal(diagnostics[0].severity, DiagnosticSeverity.Warning);
            });
        });
    });

    describe('#getType', () => {
        it('should return the type of the symbol at the position', () => {
            let ghcModOutput = ['1 1 1 10 "Expected Type"'];
            let expectedType = 'Expected Type';
            let position = Position.create(0, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getType(null, null, position, false).then((type) => {
                assert.equal(type, expectedType);
            });
        });

        it('should return the first type it finds in range', () => {
            let ghcModOutput = [
                '1 3 1 10 "Inner Type"',
                '1 2 1 20 "Middle Type"',
                '1 1 1 30 "Outer Type"',
            ];
            let expectedType = 'Inner Type';
            let position = Position.create(0, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getType(null, null, position, false).then((type) => {
                assert.equal(type, expectedType);
            });
        });

        it('should return an empty string if no type is in range', () => {
            let ghcModOutput = [
                '1 3 1 10 "Inner Type"',
                '1 2 1 20 "Middle Type"',
                '1 1 1 30 "Outer Type"',
            ];
            let position = Position.create(1, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getType(null, null, position, false).then((type) => {
                assert.equal(type, '');
            });
        });

        it('should return an empty string if no type is found', () => {
            let expectedType = '';
            let position = Position.create(0, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod([]);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getType(null, null, position, false).then((type) => {
                assert.equal(type, expectedType);
            });
        });
    });

    describe('#getInfo', () => {
        it('should return the info of the symbol at the position', () => {
            let ghcModOutput = ['Symbol', 'Info'];
            let position = Position.create(0, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getInfo('Any text', null, position, false).then((info) => {
                assert.equal(info, 'Symbol\nInfo');
            });
        });

        it('should return an empty string if ghc-mod "Cannot show info"', () => {
            let ghcModOutput = ['Cannot show info'];
            let position = Position.create(0, 5);
            let logger: ILogger = new TestLogger();
            let ghcMod: IGhcMod = new TestGhcMod(ghcModOutput);
            let provider: IGhcModProvider = new GhcModProvider(ghcMod,  '', logger );
            return provider.getType(null, null, position, false).then((info) => {
                assert.equal(info, '');
            });
        });
    });
});
