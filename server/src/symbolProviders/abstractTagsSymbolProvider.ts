/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {
    SymbolInformation, DocumentSymbolParams,
} from 'vscode-languageserver';
import { ILogger, ISymbolProvider } from '../interfaces';

export abstract class AbstractTagsSymbolProvider implements ISymbolProvider {

    protected executable: string;
    protected workspaceRoot: string;
    protected logger: ILogger;

    public constructor(executable: string, workspaceRoot: string, logger: ILogger) {
        this.executable = executable;
        this.workspaceRoot = workspaceRoot;
        this.logger = logger;
    }

    protected abstract getFileSymbolsCommand(documentSymbolParams: DocumentSymbolParams): string;
    protected abstract getWorkspaceSymbolsCommand(): string;
    protected abstract parseTags(rawTags: String): SymbolInformation[];

    public getSymbolsForFile(documentSymbolParams: DocumentSymbolParams): Thenable<SymbolInformation[]> {
        let command = this.getFileSymbolsCommand(documentSymbolParams);
        return this.getSymbols(command);
    }

    public getSymbolsForWorkspace(options, cancellationToken?): Thenable<SymbolInformation[]> {
        let command = this.getWorkspaceSymbolsCommand();
        return this.getSymbols(command).then(symbols => {
            return symbols.filter(documentSymbol => {
                return documentSymbol.name.toLowerCase().indexOf(options.query.toLowerCase()) >= 0;
            });
        });
    }

    private getSymbols(command: string): Thenable<SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            this.logger.log(command);
            cp.exec(command, (error, stdout, stderr) => {
                let errorMessage = '';
                if (error) {
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
}
