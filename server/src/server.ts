/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection,
    TextDocuments, ITextDocument,
    Position, InitializeResult, Hover
} from 'vscode-languageserver';

// Interface between VS Code extension and GHC-Mod api
import { IGhcModProvider, ILogger } from './ghcModInterfaces';
import { InteractiveGhcModProcess } from './interactiveGhcMod';
import { GhcModProvider } from './ghcModProvider';
let ghcMod: IGhcModProvider;

// Use throttled delayers to control the rate of calls to ghc-mod
import { ThrottledDelayer } from './utils/async';
let documentChangedDelayers: { [key: string]: ThrottledDelayer<void> } = Object.create(null);
let hoverDelayer: ThrottledDelayer<Hover> = new ThrottledDelayer<Hover>(100);

import { RemoteConsoleAdapter } from './utils/remoteConsoleAdapter';
let logger: ILogger;

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
    logger = new RemoteConsoleAdapter(connection.console);
    workspaceRoot = params.rootPath;
    ghcMod = new GhcModProvider(new InteractiveGhcModProcess(logger), logger);
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            hoverProvider: true,
            textDocumentSync: documents.syncKind
        }
    };
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// This event will fire for every key press, but the use of delayers 
// here means that ghcCheck will only be called ONCE for a file after
// the delay period with the most recent set of information. It does
// NOT serve as a queue.
documents.onDidChangeContent((change) => {
    let key: string = change.document.uri.toString();
    let delayer: ThrottledDelayer<void> = documentChangedDelayers[key];
    if (!delayer) {
        delayer = new ThrottledDelayer<void>(250);
        documentChangedDelayers[key] = delayer;
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
    let settings: Settings = change.settings;
    maxNumberOfProblems = settings.ghcMod.maxNumberOfProblems || 100;
    // Revalidate any open text documents
    documents.all().forEach(ghcCheck);
});

// onHover can sometimes be called once and sometimes be called
// multiple times in quick succession so a delayer is used here
// as well. Unlike above, it wouldn't make sense to use a unique
// delayer per file as only the most recent hover event matters.
connection.onHover((documentInfo) => {
    return hoverDelayer.trigger(() => {
        return getInfoOrTypeTooltip(documents.get(documentInfo.uri), documentInfo.position);
    }).then((hover) => { return hover; });
});

connection.onShutdown(() => {
    // TODO add logging
    ghcMod.shutdown();
});

function getInfoOrTypeTooltip(document: ITextDocument, position: Position): Promise<Hover> {
    return ghcMod.getInfo(document.getText(), document.uri, position)
    .then((infoTooltip) => {
        if (infoTooltip) {
            return infoTooltip;
        } else {
            return ghcMod.getType(document.getText(), document.uri, position);
        }
    }).then((tooltip) => {
       return <Hover> {
           contents: tooltip
       };
    });
}

function ghcCheck(document: ITextDocument): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        ghcMod.doCheck(document.getText(), document.uri).then((diagnostics) => {
            connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnostics.slice(0, maxNumberOfProblems) });
            resolve();
        }, (err) => {
            reject(new Error(err));
        });
    });
}

// Unused for now, but this might need changed when
// using the more advanced ghc-mod options
// function getNormalizedUri(uri: string): string {
//     return uri.replace('file:///', '').replace('%3A', ':');
// }

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
