/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ILogger, IGhcModProvider, IGhcMod, GhcModOpts } from './ghcModInterfaces';
import { DocumentUtils } from './utils/document';
import {
    Diagnostic, DiagnosticSeverity, Range, Position
} from 'vscode-languageserver';

export class GhcModProvider implements IGhcModProvider {
    private ghcMod: IGhcMod;
    private logger: ILogger;

    constructor(ghcMod: IGhcMod, logger: ILogger) {
        this.logger = logger;
        this.ghcMod = ghcMod;
    }

    // GHC-MOD COMMANDS
    public doCheck(text: string, uri: string): Promise<Diagnostic[]> {
        this.logger.log('Do Check: ' + uri);
        return this.ghcMod.runGhcModCommand(<GhcModOpts>{
            command: 'check',
            text: text,
            uri: uri
        }).then((lines) => {
            return this.parseCheckDiagnostics(lines);
        });
    }

    public getType(text: string, uri: string, position: Position): Promise<string> {
        return this.ghcMod.runGhcModCommand(<GhcModOpts>{
            command: 'type',
            text: text,
            uri: uri,
            args: [(position.line + 1).toString(), (position.character + 1).toString()]
        }).then((lines) => {
            // Returns results starting with most narrow range
            // Return the first valid type for this position
            // 1 9 1 10 "a"
            // 1 1 1 20 "a -> a"
            return lines.reduce((acc, line) => {
                if (acc) {
                    return acc;
                }
                return this.parseTypeInfo(line, position);
            }, '');
        });
    }

    public getInfo(text: string, uri: string, position: Position): Promise<string> {
        return this.ghcMod.runGhcModCommand(<GhcModOpts>{
            command: 'info',
            text: text,
            uri: uri,
            args: [DocumentUtils.getWordAtPosition(text, position)]
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
        this.ghcMod.killProcess();
    }

    // PRIVATE METHODS
    private parseTypeInfo(line: string, position: Position): string {
        // Example line: 4 1 4 17 "a -> a" 
        let tokens = line.split('"');
        let type = tokens[1] || '';
        let pos = tokens[0].trim().split(' ').map((i) => {
            return parseInt(i, 10) - 1;
        });
        let typeRange: Range;
        try {
            typeRange = Range.create(pos[0], pos[1], pos[2], pos[3]);
        } catch (error) {
            return '';
        }

        if (DocumentUtils.isPositionInRange(position, typeRange)) {
            return type;
        } else  {
            return '';
        }
    }

    private parseCheckDiagnostics(lines: string[]): Diagnostic[] {
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
}
