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

export class FastTagsSymbolProvider extends AbstractTagsSymbolProvider {

    public constructor(executable: string, workspaceRoot: string, logger: ILogger) {
        super(executable || 'fast-tags', workspaceRoot, logger);
    }

    protected getFileSymbolsCommand(documentSymbolParams : DocumentSymbolParams): string {
        let uri = documentSymbolParams.textDocument.uri;
        return `${this.executable} -o - ${VscodeFiles.uriToFilePath(uri)}`;
    }

    protected getWorkspaceSymbolsCommand(): string {
        return `${this.executable} -R ${this.workspaceRoot} -o - `;
    }

    protected parseTags(rawTags : String) : SymbolInformation[] {
        let symbolInformation = rawTags
            .split('\n')
            .slice(1)
            .map((tagLine) => { return tagLine.split('\t'); })
            .filter((line) => line.length === 4)
            .map(([name, path, line, kind]) => {
                let uri = Files.filepathToUri(path, this.workspaceRoot);
                let lineNumber = parseInt(line, 10) - 1;
                let range = Range.create(
                    Position.create(lineNumber, 0),
                    Position.create(lineNumber, 0)
                );
                let symbolKind = FastTagsSymbolProvider.toSymbolKind(kind);
                return <SymbolInformation> {
                    name : name,
                    kind : symbolKind,
                    location: Location.create(uri, range)
                };
            });
        this.logger.log(`Found ${symbolInformation.length} tags`);
        return symbolInformation;
    }

    private static toSymbolKind(rawKind : string) : SymbolKind {
        switch(rawKind.trim()) {
            case 'm':
                return SymbolKind.Module
            case 'f':
                return SymbolKind.Function
            case 'c':
                return SymbolKind.Class
            case 't':
                return SymbolKind.Interface
            case 'C':
                return SymbolKind.Constructor
            case 'o':
                return SymbolKind.Method
            default:
                return SymbolKind.Function
        }
    }
}