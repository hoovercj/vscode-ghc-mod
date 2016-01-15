/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ILogger, IGhcModProvider, IGhcModProcess, GhcModOpts } from './ghcMod';
import { GhcModProcess } from './ghcModProcess';
import {
    ITextDocument, Diagnostic, DiagnosticSeverity, Range, Position
} from 'vscode-languageserver';

export class GhcModProvider implements IGhcModProvider {
    private ghcModProcess: IGhcModProcess;
    private logger: ILogger;

    constructor(logger: ILogger) {
        this.logger = logger;
        this.ghcModProcess = new GhcModProcess(logger);
    }

    // GHC-MOD COMMANDS
    public doCheck(document: ITextDocument): Promise<Diagnostic[]> {
        this.logger.log('Do Check: ' + document.uri);
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'check',
            text: document.getText(),
            uri: document.uri
        }).then((lines) => {
            return this.getCheckDiagnostics(lines);
        });
    }

    public getType(document: ITextDocument, position: Position): Promise<string> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'type',
            text: document.getText(),
            uri: document.uri,
            args: [(position.line + 1).toString(), (position.character + 1).toString()]
        }).then((lines) => {
            lines.forEach((line) => {
                let type = this.parseTypeInfo(line, position);
                if (type) {
                    return type;
                }
            });
            return '';
            // return lines.reduce((acc, line) => {
            //     if (acc) {
            //         return acc;
            //     }
            //     return this.parseTypeInfo(line, position);
            // }, '');
        });
    }

    public getInfo(document: ITextDocument, position: Position): Promise<string> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'info',
            text: document.getText(),
            uri: document.uri,
            args: [this.getWordAtPosition(document, position)]
        }).then((lines) => {
            let tooltip = lines.join('\n');
            if (tooltip.indexOf('Cannot show info') === -1) {
                return tooltip;
            } else {
                return '';
            }
        });
    }

    public shutdown(): void {
        this.ghcModProcess.killProcess();
    }

    // PRIVATE METHODS    
    private getCheckDiagnostics(lines: string[]): Diagnostic[] {
        let diagnostics: Diagnostic[] = [];
        lines.forEach((line) => {
            let match = line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/);
            if (match) {
                this.logger.log('Diagnostic in:' + match[1]);
                diagnostics.push({
                    severity: match[4] === 'Warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                    range: {
                        start: { line: parseInt(match[2], 10) - 1, character: parseInt(match[3], 10) - 1 },
                        end: { line: parseInt(match[2], 10) - 1, character: parseInt(match[3], 10) - 1 }
                    },
                    message: line.replace(match[0], '')
                });
            }
        });
        return diagnostics;
    }

    private getWordAtPosition(document: ITextDocument, position: Position): string {
        let line = document.getText().split('\n')[position.line];
        let startPosition = line.lastIndexOf(' ', position.character) + 1;
        if (startPosition < 0) {
            startPosition = 0;
        }
        let endPosition = line.indexOf(' ', position.character);
        if (endPosition < 0) {
            endPosition = line.length;
        }
        let ret = line.slice(startPosition, endPosition);
        return ret;
    }

    private parseTypeInfo(line: string, position: Position): string {
        // Example line: 4 1 4 17 "a -> a" 
        let tokens = line.split('"');
        let type = tokens[1] || '';
        let pos = tokens[0].trim().split(' ').map((i) => { return parseInt(i, 10) - 1; });
        let typeRange: Range;
        try {
            typeRange = Range.create(pos[0], pos[1], pos[2], pos[3]);
        } catch (error) {
            return null;
        }

        if (this.isPositionInRange(position, typeRange)) {
            return type;
        } else  {
            return null;
        }
    }

    private isPositionInRange(position: Position, range: Range): boolean {
        if (position.line < range.start.line || position.line > range.end.line ||
            position.character < range.start.character || position.character > range.end.character) {
            return false;
        }
        return true;
    }
}
