import * as assert from 'assert';

import { DocumentUtils } from '../../src/utils/document';
import { Position, Range } from 'vscode-languageserver';

describe('DocumentUtils', () => {
    describe('#getSymbolAtPosition', () => {
        it ('should return entire string if entire string is a symbol', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('identifier', 3), 'identifier');
        });

        it ('should return a single character operator', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('+', 0), '+');
        });

        it ('should return a single character identifier', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('x', 0), 'x');
        });

        it ('should return entire symbol if it is bracketed by whitespace', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset(' function ', 3), 'function');
        });

        it ('should return operator if it is bracketed by identifiers', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('x*x', 1), '*');
        });

        it ('should return operator even if it contains two dashes', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('|--', 0), '|--');
        });

        it ('should return an empty string if the position is a space', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset(' ', 0), '');
        });

        it ('should return an empty string if the text is null', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset(null, 0), '');
        });

        it ('should return an empty string if the position is null', () => {
            assert.equal(DocumentUtils.getSymbolAtOffset('text', null), '');
        });
    });

    describe('#isPositionInRange', () => {
        it ('should return true if position is in range', () => {
            let position = Position.create(1, 1);
            let range = Range.create(0, 0, 2, 2);
            assert.equal(DocumentUtils.isPositionInRange(position, range), true);
        });

        it ('should return false if position is not in range', () => {
            let position = Position.create(2, 4);
            let range = Range.create(0, 0, 2, 2);
            assert.equal(DocumentUtils.isPositionInRange(position, range), false);
        });

        it ('should return false if position is null', () => {
           assert.equal(DocumentUtils.isPositionInRange(null, Range.create(0, 0, 1, 1)), false);
        });

        it ('should return false if range is null', () => {
           assert.equal(DocumentUtils.isPositionInRange(Position.create(0, 0), null), false);
        });
    });
});
