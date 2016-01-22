/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ILogger, IGhcMod, GhcModCmdOpts } from './ghcModInterfaces';
import * as cp from 'child_process';
import {EOL} from 'os';
import { ThrottledDelayer } from './utils/async';

let promiseQueue = require('promise-queue');

// *******************************************************************************
// NOTE: Editing this file with wallabyjs running will start too many processes //
// *******************************************************************************
export interface InteractiveGhcModProcessOptions {
    executable: string;
}

export class InteractiveGhcModProcess implements IGhcMod {

    private EOT: string = EOL + '\x04' + EOL;
    private childProcess: cp.ChildProcess;
    private logger: ILogger;
    private queue: any = new promiseQueue(1);
    private executable: string;

    public static create(options: InteractiveGhcModProcessOptions, logger: ILogger): InteractiveGhcModProcess {
        let defaultOptions: InteractiveGhcModProcessOptions = {
            executable: 'ghc-mod'
        };
        options = options || { executable: defaultOptions.executable };

        // Make sure executable path can be executed. 
        try {
            cp.execSync(`${options.executable} version`);
        } catch (error) {
            logger.error(`Couldn't start ghc-mod process ${error}`);
            return null;
        }

        let ret = new InteractiveGhcModProcess();
        ret.executable = options.executable;
        ret.logger = logger;
        // Start process, otherwise hover takes a while to work
        ret.spawnProcess();
        return ret;
    }

    public runGhcModCommand(options: GhcModCmdOpts): Promise<string[]> {
        return this.queue.add(() => {
            return new Promise((resolve, reject) => {
                resolve(this.runGhcModCommand_(options));
            });
        });
    }

    public runGhcModCommand_(options: GhcModCmdOpts): Promise<string[]> {
        let process = this.spawnProcess();
        if (!process) {
            this.logger.error('Process could not be spawned');
            return Promise.resolve([]);
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
                this.logger.error('Error running ghc-mod command -' + err);
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
                let message = `ghc-mod crashed on command ${command} with savedLines ${savedLines}`;
                this.logger.error(message);
                reject(message);
            };
            process.stdout.on('data', parseData);
            process.on('exit', exitCallback);
            timer = setTimeout(() => {
                cleanup();
                this.logger.log(`Timeout on ghc-mod command ${command}; message so far: ${savedLines}`);
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
        let errorDelayer = new ThrottledDelayer<void>(100);
        let errorLines: string[] = [];
        this.childProcess = cp.spawn(this.executable, ['legacy-interactive']);
        this.childProcess.on('error', (err) => {
            this.logger.error(`Error spawning ghc-mod process - ${err}`);
        });
        this.childProcess.on('exit', () => {
            this.logger.log('EXIT: ghc-mod process');
            this.childProcess = null;
        });
        this.childProcess.stderr.on('data', (data) => {
            errorLines.push(data);
            errorDelayer.trigger(() => {
                return new Promise<void>((resolve, reject) => {
                    this.logger.log(`ghc-mod stderr: ${errorLines.join('')}`);
                    errorLines = [];
                    resolve();
                });
            });
        });
        this.childProcess.stdout.setEncoding('utf-8');
        return this.childProcess;
    }

    private mapFile(process: cp.ChildProcess, options: GhcModCmdOpts): Promise<string[]> {
        // options.text represents the haskell file relevant to the command
        // In case it has not been saved, map the file to the text first
        return !options.text ? Promise.resolve([]) : this.interact(process, `map-file ${options.uri}${EOL}${options.text}${this.EOT}`);
    }

    private unmapFile(process: cp.ChildProcess, options: GhcModCmdOpts): Promise<string[]> {
        return !options.text ? Promise.resolve([]) : this.interact(process, `unmap-file ${options.uri}${EOL}`);
    }

    private commandAndArgsAsString(options: GhcModCmdOpts): string {
        let base = options.uri ? [options.command, options.uri] : [options.command];
        if (options.args) {
            base = base.concat(options.args);
        }
        return base.join(' ').replace(EOL, ' ') + EOL;
    }
}
