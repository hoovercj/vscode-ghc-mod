import { LogLevel, ILogger } from '../../src/ghcModInterfaces';

export class TestLogger implements ILogger {

    public setLogLevel(level: LogLevel): void {
        // do nothing
    }

    public log(message: string): void {
        return;
    }

    public info(message: string): void {
        return;
    }

    public warn(message: string): void {
        return;
    }

    public error(message: string): void {
        return;
    }
}
