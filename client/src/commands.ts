'use strict';

import * as vscode from 'vscode';
import { LanguageClient, RequestType, LanguageClientOptions, ServerOptions, TransportKind, TextDocumentPositionParams } from 'vscode-languageclient';

export module Commands {
    class InsertTypeMessage implements RequestType<TextDocumentPositionParams,string,void> {
        constructor() {
            this.method = "insertType";
        }
        method:string;
    }
    
    function insertType(client:LanguageClient, editor:vscode.TextEditor) {
        let sel = editor.selections[0];
        
        let info = TextDocumentPositionParams.create(editor.document.uri.toString(), sel.active);
        client.sendRequest<TextDocumentPositionParams, string, void>(new InsertTypeMessage(), info).then(type => { 
            // console.log("received type ", type);
            let iloc = new vscode.Position(sel.active.line, 0);
            editor.edit(editBuilder => {
                let line = editor.document.lineAt(iloc.line);
                editBuilder.insert(iloc, type.replace(/\s+$/,'') + '\n');
            });
        });
    }
    
    export function register(ctx: vscode.ExtensionContext, client:LanguageClient) {
        let pushReg = (x, y) => ctx.subscriptions.push(vscode.commands.registerTextEditorCommand(x, (ed, e) => y(client, ed)));
        pushReg('ghcmod.insertType', insertType);
    }
}