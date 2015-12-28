/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {GhcModOpts, GhcModProcess} from './ghcModProcess';
import {
    RemoteConsole, ITextDocument, Diagnostic, DiagnosticSeverity, Range, Position
} from 'vscode-languageserver';

import { ThrottledDelayer } from './utils/async';
let delayers: { [key: string]: ThrottledDelayer<string[]> } = Object.create(null);

import { EOL } from 'os';

export class GhcMod {
    private ghcModProcess:GhcModProcess;
    private maxNumberOfProblems = 100;
    private logger:RemoteConsole;
    
    constructor(logger:RemoteConsole) {
        this.logger = logger;
        this.ghcModProcess = new GhcModProcess(logger);
    }
    
    // GHC-MOD COMMANDS
    public doCheck(document):Promise<Diagnostic[]> {    
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'check',
            text: document.getText(),
            uri: document.uri
        }).then((lines) => {
            return this.getCheckDiagnostics(lines);
        });
    }
    
    public getInfoOrType(document:ITextDocument, position:Position):Promise<string> {
        if (this.getWordAtPosition(document, position)) {
            return this.getInfo(document, position);
        } else {
            return this.getType(document, position);
        }
    }
    
    private getType(document:ITextDocument, position:Position):Promise<string> {
        this.logger.log('GetType: ' + this.getWordAtPosition(document, position));
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts> {
            command: 'type',
            text: document.getText(),
            uri: document.uri,
            args: [(position.line + 1).toString(), (position.character + 1).toString()]
        }).then((lines) => {
            return lines.reduce((acc, line) => {
               this.logger.log('TypeLine: ' + line);
               if (acc != '') {
                   return acc
               }
               // Example line: 4 1 4 17 "a -> a" 
               var tokens = line.split('"');
               var type = tokens[1] || '';
               var pos = tokens[0].trim().split(' ').map((i) => { return parseInt(i, 10) - 1});
               
               try {
                   var typeRange = Range.create(pos[0], pos[1], pos[2], pos[3]);
               } catch(Error) {
                   return acc;
               }
               
               var cursorLine = position.line;
               var cursorCharacter = position.character;
               if (cursorLine < typeRange.start.line || cursorLine > typeRange.end.line || cursorCharacter < typeRange.start.character || cursorCharacter > typeRange.end.character) {
                   return acc;
               }              
               return type;
            }, '');
        });
    }
    
    // TODO: Sometimes the getType results are being handled in the getInfo path
    private getInfo(document:ITextDocument, position:Position):Promise<string> {
        var word = this.getWordAtPosition(document, position);
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts> {
            command: 'info',
            text: document.getText(),
            uri: document.uri,
            args: [this.getWordAtPosition(document, position)]
        }).then((lines) => {
            var tooltip = lines.join('\n');
            if (tooltip.indexOf('Cannot show info') != -1) {
                this.logger.log('Info failed, get Type');
                return this.getType(document, position)
            } else {
                return tooltip;
            }
        });
    }
    
    public shutdown() {
        this.ghcModProcess.killProcess();
    }
    
    // PRIVATE METHODS    
    private getCheckDiagnostics(lines: string[]): Diagnostic[] {
        let diagnostics: Diagnostic[] = [];
        let problems = 0;
        lines.forEach((line) => {
            let match = line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/);
            if (match) {
                diagnostics.push({
                    severity: match[4] === "Warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                    range: {
                        start: { line: parseInt(match[2]) - 1, character: parseInt(match[3]) - 1},
                        end: { line: parseInt(match[2]) - 1, character: parseInt(match[3]) - 1}
                    },
                    message: line.replace(match[0], '')  
                });
            }
        });
        return diagnostics.slice(0, this.maxNumberOfProblems);
    }
    
    public getWordAtPosition(document:ITextDocument, position:Position):string {
        var line = document.getText().split('\n')[position.line];
        var startPosition = line.lastIndexOf(' ', position.character) + 1;
        if (startPosition < 0) {
            startPosition = 0;
        }
        
        var endPosition = line.indexOf(' ', position.character);
        if (endPosition < 0) {
            endPosition = line.length;
        }
        var ret = line.slice(startPosition, endPosition);
        // this.logger.log(`Word at ${position.line},${position.character} = "${ret}"`);
        return ret;
    }
}
