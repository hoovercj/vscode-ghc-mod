'use strict';

import * as vscode from 'vscode';
import { LanguageClient, RequestType, LanguageClientOptions, ServerOptions, TransportKind, TextDocumentPositionParams } from 'vscode-languageclient';
import { Logger } from './utils/logger'

namespace InsertTypeRequest {
    export const type: RequestType<Number,string,void> = { get method() { return 'insertType'; } };
}

export namespace Commands {

    function insertType(client:LanguageClient, editor:vscode.TextEditor) {
        let selection = editor.selections[0];
        let info = TextDocumentPositionParams.create(editor.document.uri.toString(), selection.active);
        client.sendRequest<TextDocumentPositionParams, string, void>(InsertTypeRequest.type, info).then(type => { 
            if (!type) {
                Logger.log('No type information found. Not inserting type.')
                return;
            }

            Logger.log(`received type: ${type}`);
            let positionToInsert = new vscode.Position(selection.active.line, 0);
            editor.edit(editBuilder => {
                let definitionLine = editor.document.lineAt(positionToInsert.line);
                let indent = definitionLine.text.substring(0, definitionLine.firstNonWhitespaceCharacterIndex);
                let typeLine = `${indent}${type.replace(/\s+$/,'')}\n`
                editBuilder.insert(positionToInsert, typeLine);
            });
        });
    }

    export function register(context: vscode.ExtensionContext, client: LanguageClient) {
        let registerCommand = (command, callback) => 
            context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, (editor, edit) => 
                callback(client, editor)));
        registerCommand('ghcmod.insertType', insertType);
    }
}