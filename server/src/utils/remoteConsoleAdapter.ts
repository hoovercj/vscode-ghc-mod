import { RemoteConsole } from 'vscode-languageserver';
import { ILogger } from '../ghcModInterfaces';

export class RemoteConsoleAdapter implements ILogger {
    private logger: RemoteConsole;

    public constructor(console: RemoteConsole) {
        this.logger = console;
    }

    public log(message: string): void {
        this.logger.log(message);
    }

    public info(message: string): void {
        this.logger.info(message);
    }

    public warn(message: string): void {
        this.logger.warn(message);
    }

    public error(message: string): void {
        this.logger.error(message);
    }
}
