// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as server from '../src/server';

// Defines a Mocha test suite to group tests of similar kind together
// suite('Extension Tests', () => {

// Defines a Mocha unit test
describe('Something 1', () => {
    it ('should pass', () => {
        assert.equal(0, [1, 2, 3].indexOf(1));
    });
    it ('should fail', () => {
        assert.equal(-1, [1, 2, 3].indexOf(1));
    });
});
