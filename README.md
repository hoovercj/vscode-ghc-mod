# vscode-ghc-mod
ghc-mod language extension for VS Code.

## Overview
The extension follows the client/server model for language extensions from the [VS Code docs][example-server-docs]. The `client` is a normal VS Code extension and the `server` is a node program which runs in a seperate process. The two communicate through a `connection` object.

To properly run and debug the extension, the `client` and `server` directories should be opened in seperate instances of VS Code.

## Prerequisites
The extension assumes `ghc-mod` is installed and on the system PATH OR is configured via `haskell.ghc-mod.executablePath` in user or workspace settings. I installed `ghc-mod` on windows via `cabal` using [these instructions][ghc-mod-instructions] and it is working.

## Running the extension
To get the application running, clone the whole repository and run `npm install` in both the `client` and `server` directories. Then open the `client` folder in an instance of VS Code and press `F5` to start debugging. This will launch the extension in a new instance of VS Code called the extension host.

## Debugging the extension
After running the extension as explained above, press `F5` in a seperate instance of VS Code that has the `server` directory open. This will attach the debugger to the extension host.

## Testing the extension
### Mocha test runner via npm
`npm test` from the server directory will run tests against the most recently compiled version of the code. The test command does NOT currently build the application.

### Wallabyjs
This project includes a wallaby.js configuration file which should automatically work if the [wallabyjs](https://marketplace.visualstudio.com/items/WallabyJs.wallaby-vscode) extension is installed. Simply open the server folder in VS Code and issue the `start` command to wallabyjs (ctrl+shift+R, R).

## Server Components
There are three main components with distinct responsibilities. `server.ts` is responsible for all communication with VS Code and decides when to issue ghc-mod commands (i.e. check when documents change, info on hover, etc.). `ghcMod.ts` is a wrapper around the ghc-mod process running in interactive mode and handles reading and writing to the process vs stdin/stdout to issue commands and process output. It implements the `IGhcMod` interface. This allows it to be swapped out with a non-interactive implementation of `IGhcMod`. `ghcModProvider.ts` is the middleman and implements the `IGhcModProvider` interface which exposes the supported ghc-mod commands to `server.ts` via public methods such as `getType` and `doCheck` and issues properly formed commands to an object that implements `IGhcMod.ts`. It returns the results via promises.

## Features
- `ghc-mod check`
- `ghc-mod info`
- `ghc-mod type`

## Publishing
From the client directory:
`vsce publish --ImagesUrl https://raw.githubusercontent.com/hoovercj/vscode-ghc-mod/master/client/`

## Next steps
- TODO's before public feedback: https://github.com/hoovercj/vscode-ghc-mod/issues/4
- Add new commands
- Add completion backend

[example-server-docs]: https://code.visualstudio.com/docs/extensions/example-language-server
[ghc-mod-instructions]: http://www.mew.org/~kazu/proj/ghc-mod/en/install.html
[ghc-mod-atom]: https://github.com/atom-haskell/haskell-ghc-mod/