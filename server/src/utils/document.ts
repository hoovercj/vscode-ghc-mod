import { Position, Range } from 'vscode-languageserver';

export class DocumentUtils {
    public static getWordAtPosition(text: string, position: Position): string {
        if (text === null || position === null) {
            return '';
        }
        let line = text.split('\n')[position.line];
        if (line) {
            let startPosition = line.lastIndexOf(' ', position.character) + 1;
            let endPosition = line.indexOf(' ', position.character);
            if (endPosition < 0) {
                endPosition = line.length;
            }
            let ret = line.slice(startPosition, endPosition);
            return ret;
        }
        return '';
    }

    public static isPositionInRange(position: Position, range: Range): boolean {
        if (position === null  || range === null) {
            return false;
        }
        if (position.line < range.start.line || position.line > range.end.line ||
            position.character < range.start.character || position.character > range.end.character) {
            return false;
        }
        return true;
    }
}
