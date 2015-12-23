/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, ITextDocument, Diagnostic, DiagnosticSeverity, InitializeResult, Hover
} from 'vscode-languageserver';

import { ThrottledDelayer } from './utils/async';
let delayers: { [key: string]: ThrottledDelayer<void> } = Object.create(null);

import {EOL} from 'os'
let EOT = EOL + '\x04' + EOL

import * as cp from 'child_process';
let childProcess: cp.ChildProcess = null;

// Create a connection for the server. The connection uses 
// stdin / stdout for message passing
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
        }
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    let key = change.document.uri.toString();
    let delayer = delayers[key];
    if (!delayer) {
        delayer = new ThrottledDelayer<void>(250);
        delayers[key] = delayer;
    }
    // delayer.trigger(() => validateTextDocument(change.document));
    delayer.trigger(() => ghcCheck(change.document));
});

// The settings interface describe the server relevant settings part
interface Settings {
    ghcMod: GhcModSettings;
}

// These are the example settings we defined in the client's package.json
// file
interface GhcModSettings {
    maxNumberOfProblems: number;
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
    let settings = <Settings>change.settings;
    maxNumberOfProblems = settings.ghcMod.maxNumberOfProblems || 100;
    // Revalidate any open text documents
    documents.all().forEach(ghcCheck);
});

interface GhcModOpts {
    command: string,
    text?: string,
    uri?: string, // Might need normalized in the future via getNormalizedUri()
    args?: string[]
}

function ghcCheck(document:ITextDocument): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        runGhcModCommand(<GhcModOpts>{ command: 'check', text: document.getText(), uri: document.uri })
        .then((lines) => {
            connection.sendDiagnostics({uri: document.uri, diagnostics: getCheckDiagnostics(lines)});
            resolve();
        }, (err) => {
            reject(new Error(err));
        });
    });
}

function runGhcModCommand(options: GhcModOpts): Promise<string[]> {
    let process = spawnProcess();
    if (!process) {
        connection.console.log('Process could not be spawned');
        return null;
    }

    let promise = Promise.resolve();

    return promise.then(() => {
        if (options.text) {
            return interact(process, `map-file ${options.uri}${EOL}${options.text}${EOT}`); 
        }
    }).then(() => {
        let cmd = [];
        if (options.uri) {
            cmd = [options.command, options.uri].concat(options.args);
        } else {
            cmd = [options.command].concat(options.args);
        }
        return interact(process, cmd.join(' ').replace(EOL, ' ') + EOL);
    }).then((res) => {
        if (options.text) {
            interact(process, `unmap-file ${options.uri}${EOL}`).then(() => { return res });
        }
        return res;
    }, (err) => {
        return [];
    });
}

function waitForAnswer(process, command): Promise<string[]> {
    return new Promise((resolve, reject) => {
        let savedLines = [], timer = null;
        let cleanup = () => {
            process.stdout.removeListener('data', parseData);
            process.stderr.removeListener('data', parseError);
            process.removeListener('exit', exitCallback);
            clearTimeout(timer);
        }
        let parseError = (data) => {
            connection.console.log(data);
        }
        let parseData = (data) => {
            let lines = data.toString().split(EOL);
            savedLines = savedLines.concat(lines);
            let result = savedLines[savedLines.length - 2];
            if (result === 'OK') {
                cleanup();
                lines = savedLines.slice(0, -2);
                resolve(lines.map((line) => {
                    return line.replace(/\0/g, EOL);
                }));
            }
        }
        let exitCallback = () => {
            cleanup();
            reject(`ghc-modi crashed on command ${command} with message ${savedLines}`);
        }
        process.stdout.on('data', parseData);
        process.on('exit', exitCallback);
        process.stderr.on('data', parseError);
        timer = setTimeout(() => {
            cleanup();
            connection.console.log(`Timeout on ghc-modi command ${command}; message so far: ${savedLines}`);
        }, 60000);
    });
}

function interact(process: cp.ChildProcess, command: string): Promise<string[]> {
    let resultP = waitForAnswer(process, command);
    process.stdin.write(command)
    return resultP
}

function spawnProcess(): cp.ChildProcess {
    if (childProcess) {
        return childProcess;
    }
    childProcess = cp.spawn('ghc-mod', ['legacy-interactive']);    
    childProcess.on('exit', () => childProcess = null);
    return childProcess;
}

function getCheckDiagnostics(lines: string[]): Diagnostic[] {
        let diagnostics: Diagnostic[] = [];
        let problems = 0;
        for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
            let line = lines[i];
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
        }
        return diagnostics;
}

// Unused for now, but this might need changed when
// using the more advanced ghc-mod options
function getNormalizedUri(uri: string): string {
    return uri.replace('file:///', '').replace('%3A', ':');
}

/*
// Currently unused language-server features

// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentIdentifier): CompletionItem[] => {
    // The pass parameter contains the position of the text document in 
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: 'Haskell',
            kind: CompletionItemKind.Text,
            data: 1
        }
    ]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = 'Haskell details',
            item.documentation = 'Haskell documentation'
    }
    return item;
});

connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();