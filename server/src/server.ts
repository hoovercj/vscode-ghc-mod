/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection,
    TextDocuments, TextDocument,
    Position, InitializeResult, Hover,
    MarkedString, Files
} from 'vscode-languageserver';

let uriToFilePath = Files.uriToFilePath;

// Interface between VS Code extension and GHC-Mod api
import { IGhcMod, IGhcModProvider, LogLevel, ILogger } from './ghcModInterfaces';
import { InteractiveGhcModProcess, InteractiveGhcModProcessOptions } from './interactiveGhcMod';
import { GhcModProvider } from './ghcModProvider';
let ghcMod: IGhcMod;
let ghcModProvider: IGhcModProvider;

// Use throttled delayers to control the rate of calls to ghc-mod
import { ThrottledDelayer } from './utils/async';
let documentChangedDelayers: { [key: string]: ThrottledDelayer<void> } = Object.create(null);
let hoverDelayer: ThrottledDelayer<Hover> = new ThrottledDelayer<Hover>(100);

import { RemoteConnectionAdapter } from './utils/remoteConnectionAdapter';
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
    logger = new RemoteConnectionAdapter(connection);
    workspaceRoot = params.rootPath;

    // NOTE: onConfigurationChange gets called after onInitialize
    //       and the settings are needed to initialize ghcMod.
    //       Therefore, defer initialization to onConfigurationChange.
    // ghcMod = createGhcMod();
    // ghcModProvider = new GhcModProvider(ghcMod, logger);
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            hoverProvider: true,
            textDocumentSync: documents.syncKind,
            definitionProvider: true
        }
    };
});

// These are the settings we defined in the client's package.json file
interface ExtensionSettings {
    maxNumberOfProblems: number;
    executablePath: string;
    onHover: string;
    check: boolean;
    logLevel: string;
}

let settings: ExtensionSettings = Object.create({});

// The settings have changed. Is sent on server activation as well.
// It includes ALL settings. If the user has not set them, the
// default value will be sent.
connection.onDidChangeConfiguration((change) => {
    logger.log('haskell.ghcMod configuration changed');
    let oldSettings = settings;
    settings = change.settings.haskell.ghcMod;

    logger.setLogLevel(<LogLevel>LogLevel[settings.logLevel]);

    if (oldSettings.executablePath !== settings.executablePath) {
        initialize();
    } else if (oldSettings.check !== settings.check ||
               oldSettings.maxNumberOfProblems !== settings.maxNumberOfProblems) {
        // Revalidate any open text documents
        documents.all().forEach(ghcCheck);
    }
});

function initialize() {
    // Shutdown existing provider if it exists
    if (ghcModProvider) {
        ghcModProvider.shutdown();
        ghcModProvider = null;
    }

    // Disable current listeners
    connection.onHover(null);
    documents.onDidChangeContent(null);

    // Create new ghcMod and provider
    ghcMod = createGhcMod();
    if (ghcMod) {
        ghcModProvider = new GhcModProvider(ghcMod, workspaceRoot, logger);
    }

    // Initialize listeners if appropriate
    if (ghcMod && ghcModProvider) {
        initializeDocumentSync();
        initializeOnHover();
        initializeOnDefinition();
    } else {
        connection.onDefinition(null);
    }
}

function initializeDocumentSync(): void {
    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    // This event will fire for every key press, but the use of delayers 
    // here means that ghcCheck will only be called ONCE for a file after
    // the delay period with the most recent set of information. It does
    // NOT serve as a queue.
    documents.onDidChangeContent((change) => {
        let key: string = uriToFilePath(change.document.uri);
        let delayer: ThrottledDelayer<void> = documentChangedDelayers[key];
        if (!delayer) {
            // This is so check will work with auto-save
            delayer = new ThrottledDelayer<void>(1000);
            // delayer = new ThrottledDelayer<void>(250);
            documentChangedDelayers[key] = delayer;
        }
        delayer.trigger(() => ghcCheck(change.document));
    });
}

// onHover can sometimes be called once and sometimes be called
// multiple times in quick succession so a delayer is used here
// as well. Unlike above, it wouldn't make sense to use a unique
// delayer per file as only the most recent hover event matters.
function initializeOnHover(): void {
    connection.onHover((documentInfo) => {
        return hoverDelayer.trigger(() => {
            return getInfoOrTypeHover(documents.get(documentInfo.textDocument.uri), documentInfo.position);
        }).then((hover) => {
            return hover;
        });
    });
}

function initializeOnDefinition(): void {
    connection.onDefinition((documentInfo): any => {
        let document = documents.get(documentInfo.textDocument.uri);
        return ghcModProvider.getDefinitionLocation(
            document.getText(),
            uriToFilePath(document.uri),
            documentInfo.position,
            workspaceRoot);
    });
}

connection.onShutdown(() => {
    if (ghcModProvider) {
        ghcModProvider.shutdown();
    }
});

function createGhcMod(): IGhcMod {
    let options: InteractiveGhcModProcessOptions = {
        executable: settings.executablePath,
        rootPath: workspaceRoot
    };
    return InteractiveGhcModProcess.create(options, logger);
}

function getInfoOrTypeHover(document: TextDocument, position: Position): Promise<Hover> {
    // return immediately if setting is 'none'
    if (settings.onHover === 'none' || !ghcMod || !ghcModProvider) {
        return null;
    }

    return Promise.resolve().then(() => {
        if (settings.onHover === 'info' || settings.onHover === 'fallback') {
            return ghcModProvider.getInfo(document.getText(), uriToFilePath(document.uri), position);
        } else {
            return null;
        }
    }, (reason) => { logger.warn('ghcModProvider.getInfo rejected: ' + reason); })
    .then((info) => {
       if (settings.onHover === 'info' || info) {
           return info;
       } else {
           return ghcModProvider.getType(document.getText(), uriToFilePath(document.uri), position);
       }
    }, (reason) => { logger.warn('ghcModProvider.getType rejected: ' + reason); })
    .then((type) => {
        return type ? <Hover> {
            contents: <MarkedString>{ language: 'haskell', value: type }
        } : null; // https://github.com/Microsoft/vscode-languageserver-node/issues/18
    });
}

function ghcCheck(document: TextDocument): Promise<void> {
    return Promise.resolve().then(() => {
        if (!ghcMod || !ghcModProvider || !settings.check) {
            connection.sendDiagnostics({uri: document.uri, diagnostics: []});
        } else {
            ghcModProvider.doCheck(document.getText(), uriToFilePath(document.uri)).then((diagnostics) => {
                connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnostics.slice(0, settings.maxNumberOfProblems) });
            });
        }
    });
}

// Unused for now, but this might need changed when
// using the more advanced ghc-mod options
// import * as test from 'vscode-languageserver';
// let uritopath = vscode-languageserver.Files.uriToFilePath;
// or
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
