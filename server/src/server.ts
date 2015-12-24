/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, ITextDocument, Diagnostic, DiagnosticSeverity, InitializeResult
} from 'vscode-languageserver';

import {GhcModOpts, GhcModProcess} from './ghcModProcess';
let ghcModProcess:GhcModProcess;

// Create a collection for throttled delayers to
// control the rate of calls to ghc-mod
import { ThrottledDelayer } from './utils/async';
let delayers: { [key: string]: ThrottledDelayer<void> } = Object.create(null);

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
    ghcModProcess = new GhcModProcess(connection)
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

function ghcCheck(document:ITextDocument): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        ghcModProcess.runGhcModCommand(<GhcModOpts>{ command: 'check', text: document.getText(), uri: document.uri })
        .then((lines) => {
            connection.sendDiagnostics({uri: document.uri, diagnostics: getCheckDiagnostics(lines)});
            resolve();
        }, (err) => {
            reject(new Error(err));
        });
    });
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