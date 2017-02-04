/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ILogger, IGhcModProvider, IGhcMod, GhcModCmdOpts } from '../interfaces';
import { DocumentUtils } from '../utils/document';
import {
    Diagnostic, DiagnosticSeverity, Range, Position, Location, TextDocument
} from 'vscode-languageserver';

const path = require('path');
const fileUrl = require('file-url');

export class GhcModProvider implements IGhcModProvider {
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

    public getInfo(document: TextDocument, uri: string, position: Position, mapFile: boolean): Promise<string> {
        return this.getInfoHelper(document, uri, position, mapFile).then((info) => {
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

    public getDefinitionLocation(document: TextDocument, uri: string, position: Position, root: string):
            Promise<Location | Location[]> {
        return this.getInfoHelper(document, uri, position, false).then((info) => {
            return this.parseInfoForDefinition(info, root);
        });
    }

    // PRIVATE METHODS
    private getInfoHelper(document: TextDocument, uri: string, position: Position, mapFile: boolean): Promise<string> {
        let symbol = DocumentUtils.getSymbolAtOffset(document.getText(), document.offsetAt(position));

        if (symbol && !this.isBlacklisted(symbol)) {
            return this.ghcMod.runGhcModCommand(<GhcModCmdOpts>{
                command: 'info',
                text: mapFile ? document.getText() : null,
                uri: this.getRelativePath(uri),
                args: [symbol]
            }).then((lines) => {
                return lines.join('\n');
            });
        } else {
            return Promise.resolve('');
        }
    }

    private isBlacklisted(word: string): boolean {
        // if a string contains the comment sequence: --
        if (/.*--.*/g.test(word)) {
            return true;
        }

        // if a string contains the comment sequences: {\- {- -} -\}
        // if (new RegExp("\{\\?-|-\\?\}", "g").test(word)) {
        if (new RegExp('{-|-}', 'g').test(word)) {
            return true;
        }

        if (word.indexOf('-\\}') !== -1 || word.indexOf('{\\-') !== -1) {
            return true;
        }

        // TODO Explore this regex from the haskell textmate bundle
        // (^[ \t]+)?(?=--+((?![\p{S}\p{P}])|[(),;\[\]`{}_"']))
        return false;
    }

    private parseInfoForDefinition(text: string, root): Location[] {
        let regex = /-- Defined at (.+?):(\d+):(\d+)/g;
        let match;
        let locations: Location[] = [];
        do {
            match = regex.exec(text);
            if (match) {
                let uri = fileUrl(<string>match[1], { resolve: true});
                let range = Range.create(parseInt(match[2], 10) - 1, parseInt(match[3], 10) - 1,
                                         parseInt(match[2], 10) - 1, parseInt(match[3], 10) - 1);
                locations.push(Location.create(uri, range));
            }
        } while (match);
        return locations;
    }

    private getRelativePath(filepath: string): string {
        return path.relative(this.workspaceRoot || '', filepath || '');
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
