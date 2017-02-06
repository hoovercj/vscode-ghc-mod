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
    RequestType, TextDocumentPositionParams
} from 'vscode-languageserver';

let uriToFilePath = Files.uriToFilePath;
import { basename } from 'path';

// Interface between VS Code extension and GHC-Mod api
import { IGhcMod, IGhcModProvider, LogLevel, ILogger, CheckTrigger } from './interfaces';
import { InteractiveGhcModProcess, InteractiveGhcModProcessOptions } from './ghcModProviders/interactiveGhcMod';
import { GhcModProvider } from './ghcModProviders/ghcModProvider';
let ghcMod: IGhcMod;
let ghcModProvider: IGhcModProvider;

// Use throttled delayers to control the rate of calls to ghc-mod
import { ThrottledDelayer } from './utils/async';
let dirtyDocuments: Set<string> = new Set();
let documentChangedDelayers: { [key: string]: ThrottledDelayer<void> } = Object.create(null);
let hoverDelayer: ThrottledDelayer<Hover> = new ThrottledDelayer<Hover>(100);

import { RemoteConnectionAdapter } from './utils/remoteConnectionAdapter';
let logger: ILogger;

import { FastTagsSymbolProvider } from './symbolProviders/fastTagsSymbolProvider';
import { HaskTagsSymbolProvider } from './symbolProviders/haskTagsSymbolProvider';

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
            definitionProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true
        }
    };
});

// These are the settings we defined in the client's package.json file
interface ExtensionSettings {
    ghcMod: {
        maxNumberOfProblems: number;
        executablePath: string;
        onHover: string;
        check: string;
        logLevel: string;
    };
    symbols: {
        executablePath: string;
        provider: string;
    };
}

let haskellConfig: ExtensionSettings = Object.create({ghcMod: {}, symbols: {}});

let mapFiles: boolean = false;

// The settings have changed. Is sent on server activation as well.
// It includes ALL settings. If the user has not set them, the
// default value will be sent.
connection.onDidChangeConfiguration((change) => {
    logger.log('haskell configuration changed');
    let oldSettings = haskellConfig;
    haskellConfig = change.settings.haskell;
    logger.setLogLevel(LogLevel[haskellConfig.ghcMod.logLevel]);
    mapFiles = CheckTrigger[haskellConfig.ghcMod.check] === CheckTrigger.onChange;

    if (oldSettings.ghcMod.executablePath !== haskellConfig.ghcMod.executablePath) {
        initializeGhcMod();
    } else if (oldSettings.ghcMod.check !== haskellConfig.ghcMod.check ||
               oldSettings.ghcMod.maxNumberOfProblems !== haskellConfig.ghcMod.maxNumberOfProblems) {
        // Revalidate any open text documents
        documents.all().forEach(ghcCheck);
    }

    initializeSymbolProvider();
});

function initializeGhcMod(): void {
    // Shutdown existing provider if it exists
    if (ghcModProvider) {
        ghcModProvider.shutdown();
        ghcModProvider = null;
    }

    // Create new ghcMod and provider
    ghcMod = createGhcMod();
    if (ghcMod) {
        ghcModProvider = new GhcModProvider(ghcMod, workspaceRoot, logger);
    } else {
        logger.error('Try configuring user or workspace settings for haskell.ghcMod.executablePath',
                ['Workspace', 'User'], (action) => {
            connection.sendRequest<string, string, void>(OpenSettingsRequest.type, action);
        });
    }

    // Initialize listeners
    initializeDocumentSync();
    initializeOnHover();
    initializeOnDefinition();
    initializeOnCommand();
}

function initializeSymbolProvider(): void {
    let symbolProvider = null;

    switch (haskellConfig.symbols.provider) {
        case 'fast-tags':
            symbolProvider = new FastTagsSymbolProvider(haskellConfig.symbols.executablePath, workspaceRoot, logger);
            break;
        case 'hasktags':
            symbolProvider = new HaskTagsSymbolProvider(haskellConfig.symbols.executablePath, workspaceRoot, logger);
            break;
        default:
            break;
    }

    connection.onDocumentSymbol((uri) => {
        if (!symbolProvider || !ghcMod || !ghcModProvider) {
            return null;
        }

        return symbolProvider.getSymbolsForFile(uri);
    });
    connection.onWorkspaceSymbol((query, cancellationToken) => {
        if (!symbolProvider || !ghcMod || !ghcModProvider) {
            return null;
        }

        return symbolProvider.getSymbolsForWorkspace(query, cancellationToken);
    });
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
        if (CheckTrigger[haskellConfig.ghcMod.check] === CheckTrigger.onSave || haskellConfig.ghcMod.check === 'true') {
            handleChangeEvent(change);
        }
    });

    documents.onDidChangeContent((change) => {
        dirtyDocuments.add(change.document.uri);
        if (CheckTrigger[haskellConfig.ghcMod.check] === CheckTrigger.onChange) {
            handleChangeEvent(change);
        }
    });
}

function handleChangeEvent(change: TextDocumentChangeEvent): void {
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
            document,
            uriToFilePath(document.uri),
            documentInfo.position,
            workspaceRoot);
    });
}

namespace InsertTypeRequest {
    'use strict';
    export const type: RequestType<Number, string, void> = { get method(): string { return 'insertType'; } };
}

namespace OpenSettingsRequest {
    'use strict';
    export const type: RequestType<string, string, void> = { get method(): string { return 'openSettings'; } };
}

function initializeOnCommand(): void {
    connection.onRequest<TextDocumentPositionParams, string, void>
            (InsertTypeRequest.type, (documentInfo: TextDocumentPositionParams): Promise<string> => {

        if (!ghcMod || !ghcModProvider) {
            return null;
        }

        let filename = basename(documentInfo.textDocument.uri);
        let line = documentInfo.position.line;
        let character = documentInfo.position.character;
        logger.log(`Received InsertType request for ${filename} at ${line}:${character}`);

        let document = documents.get(documentInfo.textDocument.uri);
        let mapFile = mapFiles && dirtyDocuments.has(document.uri);
        return ghcModProvider.getInfo(document, uriToFilePath(document.uri), documentInfo.position, mapFile);
    });
}

connection.onShutdown(() => {
    if (ghcModProvider) {
        ghcModProvider.shutdown();
    }
});

function createGhcMod(): IGhcMod {
    let options: InteractiveGhcModProcessOptions = {
        executable: haskellConfig.ghcMod.executablePath,
        rootPath: workspaceRoot
    };
    return InteractiveGhcModProcess.create(options, logger);
}

function getInfoOrTypeHover(document: TextDocument, position: Position): Promise<Hover> {
    // return immediately if setting is 'none'
    if (haskellConfig.ghcMod.onHover === 'none' || !ghcMod || !ghcModProvider) {
        return null;
    }

    let mapFile = mapFiles && dirtyDocuments.has(document.uri);

    return Promise.resolve().then(() => {
        if (haskellConfig.ghcMod.onHover === 'info' || haskellConfig.ghcMod.onHover === 'fallback') {
            return ghcModProvider.getInfo(document, uriToFilePath(document.uri), position, mapFile);
        } else {
            return null;
        }
    }, (reason) => { logger.warn('ghcModProvider.getInfo rejected: ' + reason); })
    .then((info) => {
       if (haskellConfig.ghcMod.onHover === 'info' || info) {
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
    let mapFile = mapFiles && dirtyDocuments.has(document.uri);
    return Promise.resolve().then(() => {
        if (!ghcMod || !ghcModProvider || CheckTrigger[haskellConfig.ghcMod.check] === CheckTrigger.off) {
            connection.sendDiagnostics({uri: document.uri, diagnostics: []});
        } else {
            ghcModProvider.doCheck(document.getText(), uriToFilePath(document.uri), mapFile).then((diagnostics) => {
                connection.sendDiagnostics({
                    uri: document.uri,
                    diagnostics: diagnostics.slice(0, haskellConfig.ghcMod.maxNumberOfProblems)
                });
            });
        }
    });
}

// Listen on the connection
connection.listen();
