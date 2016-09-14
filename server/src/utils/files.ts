/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
export namespace Files {

    let Path = require('path');

    export function filepathToUri(filepath: string, workspaceRoot: string): string
    {
        if (!Path.isAbsolute(filepath)) {
            filepath = Path.join(workspaceRoot || '', filepath || '');
        }
        return `file:///${filepath.replace('\\', '/')}`;
    }
}