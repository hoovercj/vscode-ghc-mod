/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {
    SymbolKind, SymbolInformation, DocumentSymbolParams,
    Range, Position, Location, Files as VscodeFiles
} from 'vscode-languageserver';
import { ILogger, ISymbolProvider } from '../interfaces';

import { Files } from '../utils/files';

export class HaskTagsSymbolProvider implements ISymbolProvider {

    private executable: string;
    private workspaceRoot: string;
    private logger: ILogger

    public constructor(executable: string, workspaceRoot: string, logger: ILogger) {
        this.executable = executable || 'hasktags';
        this.workspaceRoot = workspaceRoot;
        this.logger = logger;
    }

    public getSymbolsForFile(documentSymbolParams : DocumentSymbolParams): Thenable<SymbolInformation[]> {
        let uri = documentSymbolParams.textDocument.uri;
        let command = `${this.executable} -c -x -o - ${VscodeFiles.uriToFilePath(uri)}`;
        return this.getSymbols(command);
    }

    public getSymbolsForWorkspace(options, cancellationToken?): Thenable<SymbolInformation[]> {
        let command = `${this.executable} -c -x -o - ${this.workspaceRoot}`;
        return this.getSymbols(command).then(symbols => {
            return symbols.filter(documentSymbol => {
                return documentSymbol.name.toLowerCase().indexOf(options.query.toLowerCase()) >= 0
            })
        });
    }

    private getSymbols(command: string): Thenable<SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            this.logger.log(command);
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
                    this.logger.error(errorMessage);
                    resolve([]);
                }
                this.logger.log(stdout.toString('UTF8'));
                resolve(this.parseTags(stdout.toString('UTF8')));
            });
        });
    }

    private parseTags(rawTags : String) : SymbolInformation[] {
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