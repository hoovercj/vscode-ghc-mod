'use strict';

import { window } from 'vscode';

export namespace Logger {
    'use strict';
    export enum LogLevel {
        none,
        error,
        warn,
        info,
        log
    }

    let logLevel = LogLevel.none;

    export const setLogLevel = function(level: LogLevel): void {
        logLevel = level;
    };

    // log methods include an optional level argument to allow
    // overriding the logger logLevel for a specific call.
    export const log = function(message: string, level?: LogLevel): void {
        if (logLevel >= LogLevel.log || level >= LogLevel.log) {
            console.log(message);
        }
    };

    export const info = function(message: string, level?: LogLevel): void {
        if (logLevel >= LogLevel.info || level >= LogLevel.info) {
            console.info(message);
        }
    };

    export const warn = function(message: string, level?: LogLevel): void {
        if (logLevel >= LogLevel.warn || level >= LogLevel.warn) {
            console.warn(message);
        }
    };

    export const error = function(message: string, level?: LogLevel): void {
        if (logLevel >= LogLevel.error || level >= LogLevel.error) {
            console.error(message);
            window.showErrorMessage(message);
        }
    };
}
