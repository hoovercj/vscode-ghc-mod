/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {
    SymbolKind, SymbolInformation, DocumentSymbolParams,
    Range, Position, Location, Files as VscodeFiles
} from 'vscode-languageserver';
import { ILogger } from '../interfaces';
import { AbstractTagsSymbolProvider } from './abstractTagsSymbolProvider';
import { Files } from '../utils/files';

export class HaskTagsSymbolProvider extends AbstractTagsSymbolProvider {

    public constructor(executable: string, workspaceRoot: string, logger: ILogger) {
        super(executable || 'hasktags', workspaceRoot, logger);
    }

    protected getFileSymbolsCommand(documentSymbolParams : DocumentSymbolParams): string {
        let uri = documentSymbolParams.textDocument.uri;
        return `${this.executable} -c -x -o - ${VscodeFiles.uriToFilePath(uri)}`;
    }

    protected getWorkspaceSymbolsCommand(): string {
        return `${this.executable} -c -x -o - ${this.workspaceRoot}`;
    }

    protected parseTags(rawTags : String) : SymbolInformation[] {
        let symbolInformation = rawTags
            .split('\n')
            .slice(3)
            .map((tagLine) => { return tagLine.split('\t'); })
            .filter((line) => line.length === 6)
            .map(([name, path, , kind, line, ]) => {
                let uri = Files.filepathToUri(path, '');
                let lineNumber = parseInt(line.replace('line:', ''), 10) - 1;
                let range = Range.create(
                    Position.create(lineNumber, 0),
                    Position.create(lineNumber, 0)
                );
                let symbolKind = HaskTagsSymbolProvider.toSymbolKind(kind);
                return <SymbolInformation> {
                    name : name,
                    kind : symbolKind,
                    location: Location.create(uri, range)
                };
            })
            .filter(HaskTagsSymbolProvider.onlyUnique)
            .filter(HaskTagsSymbolProvider.noBackToBack);

        this.logger.log(`Found ${symbolInformation.length} tags`);
        return symbolInformation;
    }

    private static toSymbolKind(rawKind : string) : SymbolKind {
        switch(rawKind.trim()) {
            case 'm':
                return SymbolKind.Module
            case 'ft':
                return SymbolKind.Function
            case 'c':
                return SymbolKind.Class
            case 'cons':
                return SymbolKind.Constructor
            case 't':
            case 'nt':
                return SymbolKind.Interface
            case 'o':
                return SymbolKind.Method
            default:
                return SymbolKind.Function
        }
    }

    private static onlyUnique(value, index, self): boolean { 
        return self.indexOf(value) === index;
    }

    private static noBackToBack(value: SymbolInformation, index, self: SymbolInformation[]): boolean {
        return index === 0 ? true :
            !(value.name === self[index - 1].name &&
              value.location.range.start.line - self[index - 1].location.range.start.line <= 1)
    }
}