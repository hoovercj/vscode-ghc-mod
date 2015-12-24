/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {GhcModOpts, GhcModProcess} from './ghcModProcess';
import {
    IConnection, ITextDocument, TextDocumentPosition, Diagnostic, DiagnosticSeverity, Range
} from 'vscode-languageserver';

export class GhcMod {
    private ghcModProcess:GhcModProcess;
    private maxNumberOfProblems = 100;
    
    constructor(connection:IConnection) {
        this.ghcModProcess = new GhcModProcess(connection);
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
    
    public getType(document:ITextDocument, documentInfo:TextDocumentPosition):Promise<string> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'type',
            text: document.getText(),
            uri: document.uri,
            args: [(documentInfo.position.line + 1).toString(), (documentInfo.position.character + 1).toString()]
        }).then((lines) => {
            return lines.reduce((acc, line) => {
               if (acc != '') {
                   return acc
               }
               var tokens = line.split('"');
               var pos = tokens[0].trim().split(' ').map((i) => { return parseInt(i) - 1});
               var type = tokens[1];
               var typeRange = Range.create(pos[0], pos[1], pos[2], pos[3]);
               var cursorLine = documentInfo.position.line;
               var cursorCharacter = documentInfo.position.character;
               if (cursorLine < typeRange.start.line || cursorLine > typeRange.end.line || cursorCharacter < typeRange.start.character || cursorCharacter > typeRange.end.character) {
                   return acc;
               }
               return type;
                
            }, '');
        });
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
        return diagnostics;
    }    
}
