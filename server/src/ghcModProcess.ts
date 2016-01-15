/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ILogger, IGhcModProcess, GhcModOpts } from './ghcMod';
import * as cp from 'child_process';
import {EOL} from 'os';

let promiseQueue = require('promise-queue');

export class GhcModProcess implements IGhcModProcess {

    private EOT: string = EOL + '\x04' + EOL;
    private childProcess: cp.ChildProcess;
    private logger: ILogger;
    private queue: any = new promiseQueue(1);

    constructor(logger: ILogger) {
        this.logger = logger;
    }

    public runGhcModCommand(options: GhcModOpts): Promise<string[]> {
        return this.queue.add(() => {
            return new Promise((resolve, reject) => {
                resolve(this.runGhcModCommand_(options));
            });
        });
    }

    public runGhcModCommand_(options: GhcModOpts): Promise<string[]> {
        let process = this.spawnProcess();
        if (!process) {
            this.logger.log('Process could not be spawned');
            // TODO: notify user of issue
            return null;
        }

        let promise = Promise.resolve();
        return promise.then(() => {
                return this.mapFile(process, options);
            }).then(() => {
                return this.interact(process, this.commandAndArgsAsString(options));
            }).then((res) => {
                return this.unmapFile(process, options).then(() => {
                    return res;
                });
            }, (err) => {
                this.logger.error('ERROR: RunGhcMod -' + err);
            });
    }

    public killProcess(): void {
        if (this.childProcess) {
            if (this.childProcess.stdin) {
                this.childProcess.stdin.end();
            }
            this.childProcess.kill();
            this.childProcess = null;
        }
    }

    private waitForAnswer(process, command): Promise<string[]> {
        return new Promise((resolve, reject) => {
            let savedLines = [], timer = null;
            let cleanup = () => {
                process.stdout.removeListener('data', parseData);
                process.removeListener('exit', exitCallback);
                clearTimeout(timer);
            };
            let parseData = (data) => {
                let lines = data.toString().split(EOL);
                savedLines = savedLines.concat(lines);
                let result = savedLines[savedLines.length - 2];
                if (result === 'OK') {
                    cleanup();
                    lines = savedLines.slice(0, -2);
                    resolve(lines.map((line) => {
                        return line.replace(/\0/g, EOL);
                    }));
                }
            };
            let exitCallback = () => {
                cleanup();
                reject(`ghc-modi crashed on command ${command} with savedLines ${savedLines}`);
            };
            process.stdout.on('data', parseData);
            process.on('exit', exitCallback);
            timer = setTimeout(() => {
                cleanup();
                this.logger.log(`Timeout on ghc-modi command ${command}; message so far: ${savedLines}`);
            }, 60000);
        });
    }

    private interact(process: cp.ChildProcess, command: string): Promise<string[]> {
        let resultP = this.waitForAnswer(process, command);
        process.stdin.write(command);
        return resultP;
    }

    private spawnProcess(): cp.ChildProcess {
        if (this.childProcess) {
            return this.childProcess;
        }
        this.childProcess = cp.spawn('ghc-mod', ['legacy-interactive']);
        this.childProcess.on('exit', () => this.childProcess = null);
        this.childProcess.stderr.on('data', (data) => {
            // TODO:
            // 1. Allow this to be configurable.
            // 2. Present this information to user -- but how?
            // https://github.com/hoovercj/vscode-ghc-mod/issues/5
            this.logger.error('Error: ' + data.toString());
        });
        this.childProcess.stdout.setEncoding('utf-8');
        return this.childProcess;
    }

    private mapFile(process: cp.ChildProcess, options: GhcModOpts): Promise<string[]> {
        // options.text represents the haskell file relevant to the command
        // In case it has not been saved, map the file to the text first
        return !options.text ? null : this.interact(process, `map-file ${options.uri}${EOL}${options.text}${this.EOT}`);
    }

    private unmapFile(process: cp.ChildProcess, options: GhcModOpts): Promise<string[]> {
        return !options.text ? null : this.interact(process, `unmap-file ${options.uri}${EOL}`);
    }

    private commandAndArgsAsString(options: GhcModOpts): string {
        let base = options.uri ? [options.command, options.uri] : [options.command];
        return base.concat(options.args).join(' ').replace(EOL, ' ') + EOL;
    }
}
