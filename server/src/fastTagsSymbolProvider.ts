/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {
    SymbolKind, SymbolInformation, DocumentSymbolParams,
    Range, Position, Location, Files as VscodeFiles
} from 'vscode-languageserver';
import { ISymbolProvider, ILogger } from './ghcModInterfaces';

import { Files } from './utils/files';

export class FastTagsSymbolProvider implements ISymbolProvider {

    private executable: string;
    private workspaceRoot: string;
    private logger: ILogger

    public constructor(executable: string, workspaceRoot: string, logger: ILogger) {
        this.executable = executable;
        this.workspaceRoot = workspaceRoot;
        this.logger = logger;
    }

    public getSymbolsForFile(documentSymbolParams : DocumentSymbolParams): Thenable<SymbolInformation[]> {
        let uri = documentSymbolParams.textDocument.uri;
        let command = `${this.executable} -o - .${VscodeFiles.uriToFilePath(uri)}`;
        return this.getSymbols(command);
    }

    public getSymbolsForWorkspace(options, cancellationToken?): Thenable<SymbolInformation[]> {
        let command = `${this.executable} -R ${this.workspaceRoot} -o - `;
        return this.getSymbols(command).then(symbols => {
            return symbols.filter(documentSymbol => {
                return documentSymbol.name.toLowerCase().indexOf(options.query.toLowerCase()) >= 0
            })
        });
    }

    private getSymbols(command: string): Thenable<SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            cp.exec(command, (error, stdout, stderr) => {
                let errorMessage = '';
                if(error) {
                    errorMessage += JSON.stringify(error);
                    errorMessage += '\n';
                }
                if (stderr) {
                    errorMessage += stderr.toString();
                }

                if (errorMessage) {
                    this.logger.warn(errorMessage);
                    resolve([]);
                }
                resolve(this.parseTags(stdout.toString('UTF8')));
            });
        });
    }

    private parseTags(rawTags : String) : SymbolInformation[] {
        let symbolInformation = rawTags
            .split('\n')
            .slice(1)
            .map((tagLine) => { return tagLine.split('\t') })
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