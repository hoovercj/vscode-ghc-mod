import { Position, Range } from 'vscode-languageserver';

export class DocumentUtils {
    public static getSymbolAtOffset(text: String, offset: number): string {
        let symbolRegex = /^[!#$%&*+./<=>?@\\^|\-~:]+$/;
        let identifierRegex = /^[a-zA-Z][a-zA-Z0-9']*$/;
        var symbol = '';

        if (text === null || offset === null) {
            // Do nothing and return empty string
        } else if (symbolRegex.test(text.charAt(offset))) {
            var start = offset;
            var end = offset;

            for (; symbolRegex.test(text.charAt(start - 1)); start--) {}
            for (; symbolRegex.test(text.charAt(end)); end++) {}

            symbol = text.substring(start, end);
        } else if (identifierRegex.test(text.charAt(offset))) {
            var start = offset;
            var end = offset;

            for (; identifierRegex.test(text.charAt(start - 1)); start--) {}
            for (; identifierRegex.test(text.charAt(end)); end++) {}

            symbol = text.substring(start, end);
        }

        // Ordinary comment is not a symbol
        if (symbol === '--') {
            return '';
        }

        // Nested coment open/close are not symbols
        if (symbol === '-') {
            if (text.charAt(offset - 1) === '{' || text.charAt(offset + 1) === '}') {
                return '';
            }
        }

        return symbol;
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
