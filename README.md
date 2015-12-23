# vscode-ghc-mod
ghc-mod language extension for VS Code.

## Overview
The extension follows the client/server model for language extensions from the [VS Code docs][example-server-docs]. The `client` is a normal VS Code extension and the `server` is a node program which runs in a seperate process. The two communicate through a `connection` object.

To properly run and debug the extension, the `client` and `server` directories should be opened in seperate instances of VS Code.

## Prerequisites
The extension assumes `ghc-mod` is installed and on the system PATH. I installed `ghc-mod` on windows via `cabal` using [these instructions][ghc-mod-instructions] and it is working.

## Running the extension
To get the application running, clone the whole repository and run `npm install` in both the `client` and `server` directories. Then open the `client` folder in an instance of VS Code and press `F5` to start debugging. This will launch the extension in a new instance of VS Code called the extension host.

## Debugging the extension
After running the extension as explained above, press `F5` in a seperate instance of VS Code that has the `server` directory open. This will attach the debugger to the extension host.

## Features
- `ghc-mod check`

## Next steps
The extension is based heavily on the [ghc-mod package][ghc-mod-atom] for atom. Currently everything is smashed into the main `server.ts` file but should be extracted as in the atom package. Then additional ghc-mod commands can be added.

[example-server-docs]: https://code.visualstudio.com/docs/extensions/example-language-server
[ghc-mod-instructions]: http://www.mew.org/~kazu/proj/ghc-mod/en/install.html
[ghc-mod-atom]: https://github.com/atom-haskell/haskell-ghc-mod/