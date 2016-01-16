import { ILogger } from '../../src/ghcModInterfaces';

export class TestLogger implements ILogger {

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
