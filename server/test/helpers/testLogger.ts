/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { LogLevel, ILogger } from '../../src/interfaces';

export class TestLogger implements ILogger {

    public setLogger(): void {
        // do nothing
    }

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
