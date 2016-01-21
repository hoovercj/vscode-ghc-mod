import { IConnection, RemoteConsole, RemoteWindow } from 'vscode-languageserver';
import { ILogger } from '../ghcModInterfaces';

export class RemoteConnectionAdapter implements ILogger {
    private logger: RemoteConsole;
    private window: RemoteWindow;

    public constructor(connection: IConnection) {
        this.logger = connection.console;
        this.window = connection.window;
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
        this.window.showErrorMessage(message);
    }
}
