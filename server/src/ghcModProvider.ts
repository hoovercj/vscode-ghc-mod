/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ILogger, IGhcModProvider, IGhcMod, GhcModCmdOpts } from './ghcModInterfaces';
import { DocumentUtils } from './utils/document';
import {
    Diagnostic, DiagnosticSeverity, Range, Position, Location
} from 'vscode-languageserver';

let Path = require('path');

export class GhcModProvider implements IGhcModProvider
 {
    private ghcMod: IGhcMod;
    private logger: ILogger;
    private workspaceRoot: string;

    constructor(ghcMod: IGhcMod, workspaceRoot: string, logger: ILogger) {
        this.ghcMod = ghcMod;
        this.workspaceRoot = workspaceRoot;
        this.logger = logger;
    }

    // GHC-MOD COMMANDS
    public doCheck(text: string, uri: string, mapFile: boolean): Promise<Diagnostic[]> {
        return this.ghcMod.runGhcModCommand(<GhcModCmdOpts>{
            command: 'check',
            text: mapFile ? text : null,
            uri: this.getRelativePath(uri)
        }).then((lines) => {
            return this.parseCheckDiagnostics(lines);
        });
    }

    public getType(text: string, uri: string, position: Position, mapFile: boolean): Promise<string> {
        return this.ghcMod.runGhcModCommand(<GhcModCmdOpts>{
            command: 'type',
            text: mapFile ? text : null,
            uri: this.getRelativePath(uri),
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

    public getInfo(text: string, uri: string, position: Position, mapFile: boolean): Promise<string> {
        return this.getInfoHelper(text, uri, position, mapFile).then((info) => {
            let tooltip = info.replace(/-- Defined at (.+?):(\d+):(\d+)/g, '');
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

    public getDefinitionLocation(text: string, uri: string, position: Position, root: string): Promise<Location | Location[]> {
        return this.getInfoHelper(text, uri, position, false).then((info) => {
            return this.parseInfoForDefinition(info, root);
        });
    }

    // PRIVATE METHODS
    private getInfoHelper(text: string, uri: string, position: Position, mapFile: boolean): Promise<string> {
        let word = DocumentUtils.getWordAtPosition(text, position);

        // Fix for https://github.com/hoovercj/vscode-ghc-mod/issues/11
        if (word == '->') {
            word = '(->)';
        }

        // Comments make ghc-mod freakout
        if (word == '--' || !word) {
            word = null;
        }

        if(word && word.trim()) {
            return this.ghcMod.runGhcModCommand(<GhcModCmdOpts>{
                command: 'info',
                text: mapFile ? text : null,
                uri: this.getRelativePath(uri),
                args: [word]
            }).then((lines) => {
                return lines.join('\n');
            });
        } else {
            return Promise.resolve('');
        }

    }

    private parseInfoForDefinition(text: string, root): Location[] {
        let regex = /-- Defined at (.+?):(\d+):(\d+)/g;
        let match;
        let locations: Location[] = [];
        do {
            match = regex.exec(text);
            if (match) {
                let uri = this.filepathToUri(<string>match[1]);
                let range = Range.create(parseInt(match[2], 10) - 1, parseInt(match[3], 10) - 1,
                                         parseInt(match[2], 10) - 1, parseInt(match[3], 10) - 1);
                locations.push(Location.create(uri, range));
            }
        } while (match);
        return locations;
    }

    private filepathToUri(filepath: string): string {
        if (!Path.isAbsolute(filepath)) {
            filepath = Path.join(this.workspaceRoot || '', filepath || '');
        }
        return `file:///${filepath.replace('\\', '/')}`;
    }

    private getRelativePath(filepath: string): string {
        return Path.relative(this.workspaceRoot || '', filepath || '');
    }

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
