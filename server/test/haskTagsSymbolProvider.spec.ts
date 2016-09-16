import * as assert from 'assert';
import { ILogger } from '../src/interfaces';
import { HaskTagsSymbolProvider } from '../src/symbolProviders/haskTagsSymbolProvider';
import { DocumentSymbolParams, SymbolInformation, SymbolKind,
         Location, Range, Position } from 'vscode-languageserver';
import * as path from 'path';
import { TestLogger } from './helpers/testLogger';

const fileUrl = require('file-url');

describe('HaskTagsSymbolProvider', () => {

    let logger: ILogger = new TestLogger();

    let haskTagsCommand = 'hasktags';

    let cwd = process.cwd();
    let symbolsZeroPath: string = path.join(cwd, '/test/fixtures/symbols/symbols0.hs');
    let symbolsOnePath: string = path.join(cwd, '/test/fixtures/symbols/symbols1.hs');

    let position0 = Position.create(0, 0);
    let range0 = Range.create(position0, position0);
    let uri0 = fileUrl(symbolsZeroPath);

    let position1 = Position.create(1, 0);
    let range1 = Range.create(position1, position1);
    let uri1 = fileUrl(symbolsOnePath);

    let locationA = Location.create(uri0, range0);
    let locationB = Location.create(uri1, range0);
    let locationCube = Location.create(uri0, range1);

    describe ('#getSymbolsForFile', () => {
        it ('should return the correct symbols from a file', () => {
            let symbolProvider = new HaskTagsSymbolProvider(haskTagsCommand, cwd, logger);
            let documentSymbolParams = <DocumentSymbolParams>{ textDocument: { uri: uri0 } };
            return symbolProvider.getSymbolsForFile(documentSymbolParams).then((symbols) => {
                let expectedSymbols = <SymbolInformation[]> [
                    {
                        name: 'A',
                        kind: SymbolKind.Module,
                        location: locationA
                    },
                    {
                        name: 'cube',
                        kind: SymbolKind.Function,
                        location: locationCube
                    }
                ];
                assert.deepEqual(symbols, expectedSymbols);
            });
        });

        it ('should return an empty array when the file is empty', () => {
            let symbolProvider = new HaskTagsSymbolProvider(haskTagsCommand, cwd, logger);
            let path: string = './test/fixtures/empty.hs';
            let documentSymbolParams = <DocumentSymbolParams>{ textDocument: { uri: fileUrl(path) } };
            return symbolProvider.getSymbolsForFile(documentSymbolParams).then((symbols) => {
                assert.equal(symbols.length, 0);
            });
        });
    });

    describe('#getSymbolsForFile', () => {
        it ('should return the symbols matching the query', () => {
            let symbolProvider = new HaskTagsSymbolProvider(haskTagsCommand, cwd, logger);
            return symbolProvider.getSymbolsForWorkspace({query: 'B'}).then((symbols) => {
                let expectedSymbols = <SymbolInformation[]> [
                    {
                        name: 'B',
                        kind: SymbolKind.Module,
                        location: locationB
                    },
                    {
                        name: 'cube',
                        kind: SymbolKind.Function,
                        location: locationCube
                    }
                ];
                assert.deepEqual(symbols, expectedSymbols);
            });
        });

        it ('should return an empty array when the directory is empty', () => {
            let symbolProvider = new HaskTagsSymbolProvider(haskTagsCommand, './test/fixtures/symbols/empty/', logger);
            return symbolProvider.getSymbolsForWorkspace({query: 'b'}).then((symbols) => {
                assert.equal(symbols.length, 0);
            });
        });
    });
});
