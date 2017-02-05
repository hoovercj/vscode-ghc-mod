import { Position, Range } from 'vscode-languageserver';

export class DocumentUtils {
    public static getSymbolAtOffset(text: string, offset: number): string {
        // Identifier, defined as varid and conid in the lexical structure chapter of the Haskell Report
        const identifierCharacterClass = '[a-zA-Z0-9\']';
        const identifierCharacterRegex = new RegExp('^' + identifierCharacterClass + '$');

        // Operator symbols, defined as varsym and consym in the lexical structure chapter of the Haskell Report
        const operatorCharacterClass = '[!#$%&*+.\\\/<=>?@\\\\\\^|\\-~:]';
        const operatorCharacterRegex = new RegExp('^' + operatorCharacterClass + '$');

        if (text === null || offset === null) {
            return '';
        }

        const character = text.charAt(offset);
        const isIdentifier = identifierCharacterRegex.test(character);
        const isOperator = operatorCharacterRegex.test(character);

        let symbol;
        
        if (isIdentifier && isOperator) {
            throw new Error("Failed to disambiguate character, cannot get symbol at offset");
        } else if (isIdentifier) {
            symbol = DocumentUtils.expandAtOffset(text, offset, character => identifierCharacterRegex.test(character));
        } else if (isOperator) {
            symbol = DocumentUtils.expandAtOffset(text, offset, character => operatorCharacterRegex.test(character));
        } else {
            return '';
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

    private static expandAtOffset(text: string, offset: number, shouldIncludeCharacter: (character: string) => boolean): string {
        let start = offset;
        let end = offset;

        for (; shouldIncludeCharacter(text.charAt(start - 1)); start--) {}
        for (; shouldIncludeCharacter(text.charAt(end)); end++) {}

        return text.substring(start, end);
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
