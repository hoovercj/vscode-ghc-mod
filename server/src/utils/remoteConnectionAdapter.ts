/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IConnection, RemoteConsole, RemoteWindow, MessageActionItem } from 'vscode-languageserver';
import { LogLevel, ILogger } from '../interfaces';

export class RemoteConnectionAdapter implements ILogger {
    private logger: RemoteConsole;
    private window: RemoteWindow;
    private level: LogLevel;

    public constructor(connection: IConnection, level?: LogLevel) {
        this.level = level || LogLevel.error;
        this.logger = connection.console;
        this.window = connection.window;
    }

    public setLogger(logger: IConnection): void {
        this.logger = logger.console;
    }

    public setLogLevel(level: LogLevel): void {
        this.level = level;
    }

    public log(message: string): void {
        if (this.level >= LogLevel.log) {
            this.logger.log(message);
            console.log(message);
        }
    }

    public info(message: string, actions?: string[], callback?): void {
        if (this.level >= LogLevel.info) {
            this.logger.info(message);
            console.info(message);
            if (actions && callback) {
                let messageActionItems = actions.map((action) => { return <MessageActionItem>{ title: action }; });
                this.window.showInformationMessage(message, ...messageActionItems).then(selected => {
                    callback(selected.title);
                });
            }
        }
    }

    public warn(message: string, actions?: string[], callback?): void {
        if (this.level >= LogLevel.warn) {
            this.logger.warn(message);
            console.warn(message);
            if (actions && callback) {
                let messageActionItems = actions.map((action) => { return <MessageActionItem>{ title: action }; });
                this.window.showWarningMessage(message, ...messageActionItems).then(selected => {
                    callback(selected.title);
                });
            }
        }
    }

    public error(message: string, actions?: string[], callback?): void {
        if (this.level >= LogLevel.error) {
            this.logger.error(message);
            console.error(message);
            if (actions && callback) {
                let messageActionItems = actions.map((action) => { return <MessageActionItem>{ title: action }; });
                this.window.showErrorMessage(message, ...messageActionItems).then(selected => {
                    callback(selected.title);
                });
            }
        }
    }
}
