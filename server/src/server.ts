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
    MarkedString, Files, TextDocumentChangeEvent,
    RequestType, RequestHandler, TextDocumentPositionParams
} from 'vscode-languageserver';

let uriToFilePath = Files.uriToFilePath;

// Interface between VS Code extension and GHC-Mod api
import { IGhcMod, IGhcModProvider, LogLevel, ILogger, CheckTrigger } from './ghcModInterfaces';
import { InteractiveGhcModProcess, InteractiveGhcModProcessOptions } from './interactiveGhcMod';
import { GhcModProvider } from './ghcModProvider';
let ghcMod: IGhcMod;
let ghcModProvider: IGhcModProvider;

// Use throttled delayers to control the rate of calls to ghc-mod
import { ThrottledDelayer } from './utils/async';
let dirtyDocuments: Set<string> = new Set();
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
    check: string;
    logLevel: string;
}

let settings: ExtensionSettings = Object.create({});

let mapFiles: boolean = false;

// The settings have changed. Is sent on server activation as well.
// It includes ALL settings. If the user has not set them, the
// default value will be sent.
connection.onDidChangeConfiguration((change) => {
    logger.log('haskell.ghcMod configuration changed');
    let oldSettings = settings;
    settings = change.settings.haskell.ghcMod;
    mapFiles = CheckTrigger[settings.check] == CheckTrigger.onChange;
    logger.setLogLevel(LogLevel[settings.logLevel]);

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
    connection.onRequest(new InsertTypeMessage(), null);
    documents.onDidChangeContent(null);
    documents.onDidSave(null);

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
        initializeOnCommand();
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
    documents.onDidSave((change) => {
        dirtyDocuments.delete(change.document.uri);
        if(CheckTrigger[settings.check] == CheckTrigger.onSave || settings.check == "true") {
            handleChangeEvent(change);
        }
    });

    documents.onDidChangeContent((change) => {
        dirtyDocuments.add(change.document.uri);
        if(CheckTrigger[settings.check] == CheckTrigger.onChange) {
            handleChangeEvent(change);
        }
    });
}

function handleChangeEvent(change: TextDocumentChangeEvent) {
    let key: string = uriToFilePath(change.document.uri);
    let delayer: ThrottledDelayer<void> = documentChangedDelayers[key];
    if (!delayer) {
        // This is so check will work with auto-save
        delayer = new ThrottledDelayer<void>(1000);
        // delayer = new ThrottledDelayer<void>(250);
        documentChangedDelayers[key] = delayer;
    }
    delayer.trigger(() => ghcCheck(change.document));
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

   class InsertTypeMessage implements RequestType<Number,string,void> {
        constructor() {
            this.method = "insertType";
        }
        method:string;
    }

function initializeOnCommand(): void {
    connection.onRequest<TextDocumentPositionParams,string,void>(new InsertTypeMessage(), (documentInfo:TextDocumentPositionParams): any => {
        let document = documents.get(documentInfo.textDocument.uri);
        var mapFile = mapFiles && dirtyDocuments.has(document.uri);
        return ghcModProvider.getInfo(document.getText(), uriToFilePath(document.uri), documentInfo.position, mapFile)
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

    var mapFile = mapFiles && dirtyDocuments.has(document.uri);

    return Promise.resolve().then(() => {
        if (settings.onHover === 'info' || settings.onHover === 'fallback') {
            return ghcModProvider.getInfo(document.getText(), uriToFilePath(document.uri), position, mapFile);
        } else {
            return null;
        }
    }, (reason) => { logger.warn('ghcModProvider.getInfo rejected: ' + reason); })
    .then((info) => {
       if (settings.onHover === 'info' || info) {
           return info;
       } else {
           return ghcModProvider.getType(document.getText(), uriToFilePath(document.uri), position, mapFile);
       }
    }, (reason) => { logger.warn('ghcModProvider.getType rejected: ' + reason); })
    .then((type) => {
        return type ? <Hover> {
            contents: <MarkedString>{ language: 'haskell', value: type }
        } : null; // https://github.com/Microsoft/vscode-languageserver-node/issues/18
    });
}

function ghcCheck(document: TextDocument): Promise<void> {
    var mapFile = mapFiles && dirtyDocuments.has(document.uri);
    return Promise.resolve().then(() => {
        if (!ghcMod || !ghcModProvider || CheckTrigger[settings.check] == CheckTrigger.off) {
            connection.sendDiagnostics({uri: document.uri, diagnostics: []});
        } else {
            ghcModProvider.doCheck(document.getText(), uriToFilePath(document.uri), mapFile).then((diagnostics) => {
                connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnostics.slice(0, settings.maxNumberOfProblems) });
            });
        }
    });
}

// Listen on the connection
connection.listen();
