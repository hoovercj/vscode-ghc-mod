import { Diagnostic, Position } from 'vscode-languageserver';

export interface ILogger {
    info(message: string): void;
    log(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface GhcModOpts {
    command: string;
    text?: string;
    uri?: string; // Might need normalized in the future via getNormalizedUri()
    args?: string[];
}

export interface IGhcMod {
    runGhcModCommand(options: GhcModOpts): Promise<string[]>;
    killProcess(): void;
}

export interface IGhcModProvider {
    doCheck(text: string, uri: string): Promise<Diagnostic[]>;
    getType(text: string, uri: string, position: Position): Promise<string>;
    getInfo(text: string, uri: string, position: Position): Promise<string>;
    shutdown(): void;
}
