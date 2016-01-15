import { ITextDocument, Diagnostic, Position } from 'vscode-languageserver';

export interface GhcModOpts {
    command: string;
    text?: string;
    uri?: string; // Might need normalized in the future via getNormalizedUri()
    args?: string[];
}

export interface IGhcModProcess {
    runGhcModCommand(options: GhcModOpts): Promise<string[]>;
    killProcess(): void;
}

export interface IGhcModProvider {
    doCheck(document: ITextDocument): Promise<Diagnostic[]>;
    getType(document: ITextDocument, position: Position): Promise<string>;
    getInfo(document: ITextDocument, position: Position): Promise<string>;
    shutdown(): void;
}
