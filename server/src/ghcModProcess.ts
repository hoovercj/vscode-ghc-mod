/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {EOL} from 'os'

export interface GhcModOpts {
    command: string,
    text?: string,
    uri?: string, // Might need normalized in the future via getNormalizedUri()
    args?: string[]
}

export class GhcModProcess {

    private EOT = EOL + '\x04' + EOL;
    private childProcess:cp.ChildProcess;
    private connection;
    
    constructor(connection) {
        this.connection = connection;
    }
   
    public runGhcModCommand(options: GhcModOpts): Promise<string[]> {
        let process = this.spawnProcess();
        if (!process) {
            this.connection.console.log('Process could not be spawned');
            return null;
        }

        let promise = Promise.resolve();

        return promise.then(() => {
            if (options.text) {
                return this.interact(process, `map-file ${options.uri}${EOL}${options.text}${this.EOT}`); 
            }
        }).then(() => {
            let cmd = [];
            if (options.uri) {
                cmd = [options.command, options.uri].concat(options.args);
            } else {
                cmd = [options.command].concat(options.args);
            }
            return this.interact(process, cmd.join(' ').replace(EOL, ' ') + EOL);
        }).then((res) => {
            if (options.text) {
                this.interact(process, `unmap-file ${options.uri}${EOL}`).then(() => { return res });
            }
            return res;
        }, (err) => {
            return [];
        });
    }

    
    private waitForAnswer(process, command): Promise<string[]> {
        return new Promise((resolve, reject) => {
            let savedLines = [], timer = null;
            let cleanup = () => {
                process.stdout.removeListener('data', parseData);
                process.stderr.removeListener('data', parseError);
                process.removeListener('exit', exitCallback);
                clearTimeout(timer);
            }
            let parseError = (data) => {
                this.connection.console.log(data);
            }
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
            }
            let exitCallback = () => {
                cleanup();
                reject(`ghc-modi crashed on command ${command} with message ${savedLines}`);
            }
            process.stdout.on('data', parseData);
            process.on('exit', exitCallback);
            process.stderr.on('data', parseError);
            timer = setTimeout(() => {
                cleanup();
                this.connection.console.log(`Timeout on ghc-modi command ${command}; message so far: ${savedLines}`);
            }, 60000);
        });
    }

    private interact(process: cp.ChildProcess, command: string): Promise<string[]> {
        let resultP = this.waitForAnswer(process, command);
        process.stdin.write(command)
        return resultP
    }

    private spawnProcess(): cp.ChildProcess {
        if (this.childProcess) {
            return this.childProcess;
        }
        this.childProcess = cp.spawn('ghc-mod', ['legacy-interactive']);    
        this.childProcess.on('exit', () => this.childProcess = null);
        return this.childProcess;
    }
}