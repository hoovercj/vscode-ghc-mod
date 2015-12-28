/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import {EOL} from 'os'
import {
    RemoteConsole
} from 'vscode-languageserver';

let Queue = require('promise-queue');

export interface GhcModOpts {
    command: string,
    text?: string,
    uri?: string, // Might need normalized in the future via getNormalizedUri()
    args?: string[]
}

export class GhcModProcess {    

    private EOT = EOL + '\x04' + EOL;
    private childProcess:cp.ChildProcess;
    private logger:RemoteConsole;
    private queue = new Queue(1);
    
    constructor(logger:RemoteConsole) {
        this.logger = logger;
    }
    
    public runGhcModCommand(options: GhcModOpts): Promise<string[]> {
        this.logger.log('Queue: ' + options.command + ' - ' + (options.args ? options.args.join(' ') : ''));
        return this.queue.add(() => { 
            return new Promise((resolve, reject) => {
                resolve(this.runGhcModCommand_(options))
            })
        });
    }
    
    public runGhcModCommand_(options: GhcModOpts): Promise<string[]> {
        this.logger.log('Start: ' + options.command);
        let process = this.spawnProcess();
        if (!process) {
            this.logger.log('Process could not be spawned');
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
            this.logger.log("Execute: " + cmd.join(' '))
            return this.interact(process, cmd.join(' ').replace(EOL, ' ') + EOL);
        }).then((res) => {
            this.logger.log('End: ' + options.command + ' - ' + res.join('\n'));
            if (options.text) {
                this.interact(process, `unmap-file ${options.uri}${EOL}`).then(() => { return res });
            }
            return res;
        }, (err) => {
            return [];
        });
    }

    public killProcess():void {
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
            // process.stderr.on('data', parseError);
            timer = setTimeout(() => {
                cleanup();
                this.logger.log(`Timeout on ghc-modi command ${command}; message so far: ${savedLines}`);
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
        this.childProcess.stderr.on('data', (data) => {
            // this.logger.log('Error: ' + data.toString());
        });
        this.childProcess.stdout.setEncoding('utf-8');        
        return this.childProcess;
    }
}