/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IConnection, RemoteConsole, RemoteWindow } from 'vscode-languageserver';
import { LogLevel, ILogger } from '../ghcModInterfaces';

export class RemoteConnectionAdapter implements ILogger {
    private logger: RemoteConsole;
    private window: RemoteWindow;
    private level: LogLevel;

    public constructor(connection: IConnection, level?: LogLevel) {
        this.level = level || LogLevel.error;
        this.logger = connection.console;
        this.window = connection.window;
    }

    public setLogger(logger: IConnection) {
        this.logger = logger.console;
    }

    public setLogLevel(level: LogLevel): void {
        this.level = level;
    }

    public log(message: string): void {
        if (this.level >= LogLevel.log) {
            this.logger.log(message);
        }
    }

    public info(message: string): void {
        if (this.level >= LogLevel.info) {
            this.logger.info(message);
        }
    }

    public warn(message: string): void {
        if (this.level >= LogLevel.warn) {
            this.logger.warn(message);
        }
    }

    public error(message: string): void {
        if (this.level >= LogLevel.error) {
            this.logger.error(message);
            this.window.showErrorMessage(message);
        }
    }
}
