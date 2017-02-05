import { Position, Range } from 'vscode-languageserver';

import { HaskellLexicalRules } from './haskellLexicalStructure';

export class DocumentUtils {
    public static getSymbolAtOffset(text: string, offset: number): string {
        if (text === null || offset === null) {
            return '';
        }

        const identifierCharacterRegex = new RegExp('^' + HaskellLexicalRules.IdentifierRegexCharacterClass + '$', 'u');
        const operatorCharacterRegex = new RegExp('^' + HaskellLexicalRules.OperatorRegexCharacterClass + '$', 'u');

        const character = text.charAt(offset);
        const isIdentifier = identifierCharacterRegex.test(character);
        const isOperator = operatorCharacterRegex.test(character);

        let symbol;

        if (isIdentifier && isOperator) {
            throw new Error(`Failed to disambiguate character '${character}' at offset ${offset}`);
        } else if (isIdentifier) {
            symbol = DocumentUtils.expandAtOffset(text, offset, char => identifierCharacterRegex.test(char));
        } else if (isOperator) {
            symbol = DocumentUtils.expandAtOffset(text, offset, char => operatorCharacterRegex.test(char));
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

    private static expandAtOffset(text: string, offset: number,
            shouldIncludeCharacter: (character: string) => boolean): string {
        let start = offset;
        let end = offset;

        for (; shouldIncludeCharacter(text.charAt(start - 1)); start--) { /* Intentionally empty */ }
        for (; shouldIncludeCharacter(text.charAt(end)); end++) { /* Intentionally empty */ }

        return text.substring(start, end);
    }
}
