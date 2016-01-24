# vscode-ghc-mod
This exension exposes ghc-mod functionality to VS Code. It requires having ghc-mod installed. I installed it on Windows via `cabal` using [these instructions][ghc-mod-instructions] and it is working. Hasn't been tested on Linux or OSX.

Features:
- `check`: Only works when a file is saved so this works best with autosave on.
- `type` and `info`: Displayed when hovering the mouse over a symbol. See below for configuration.
- `Go to definition`: ctrl+click, press f12, or right-click -> "Peek/Go to definition" 

For linting, please use the [haskell-linter extension][haskell-linter-extension].

## Pictures
### Check
Example 1:  
![Check](images/check.png)  
Example 2:  
![Check2](images/check2.png)  

### Info
Example 1:  
![Info](images/info.png)  
Example 2:  
![Info2](images/info2.png)  

### Type
![Type](images/type.png)

### Go To Definition
![Definition](images/definition.png)

## Configuration:
The following options can be set in workspace or user preferences:
```json
"haskell.ghcMod.maxNumberOfProblems": {
    "type": "number",
    "default": 100,
    "maximum": 100,
    "description": "Controls the maximum number of problems reported."
},
"haskell.ghcMod.executablePath": {
    "type": "string",
    "default": "ghc-mod",
    "description": "The full path to the ghc-mod executable."
},
"haskell.ghcMod.onHover": {
    "type": "string",
    "enum": [
        "info",
        "type",
        "fallback",
        "none"
    ],
    "default": "fallback",
    "description": "Controls the onHover behavior. 'info' will display ghc-mod info, 'type' will display ghc-mod type, 'fallback' will try info and fallback to type,and 'none' will disable onHover tooltips."
},
"haskell.ghcMod.check": {
    "type": "boolean",
    "default": true,
    "description": "Controls whether ghc-mod check is enabled or not" 
},
"haskell.ghcMod.logLevel": {
    "type": "string",
    "enum": [
        "none",
        "log",
        "info",
        "warn",
        "error"
    ],
    "default": "error",
    "description": "Controls the verbosity of logging. Logs can be seen in the console by opening the dev tools."
}
```

## Changelog
__0.2.0__
- __Breaking:__ Files must be saved (auto-save is your friend)
- Type and Info tooltips are now more colorful (treated as code)
- Go To Definition works

[ghc-mod-instructions]: http://www.mew.org/~kazu/proj/ghc-mod/en/install.html
[haskell-linter-extension]: https://marketplace.visualstudio.com/items/hoovercj.haskell-linter
