module.exports = function (w) {

  return {
    files: [
      'src/**/*.ts',
      'test/helpers/*.ts',
      'test/fixtures/*'
    ],

    tests: [
      'test/**/*spec.ts'
    ],

    env: {
      type: 'node'
    },
    
    compilers: {
        '**/*.ts': w.compilers.typeScript({ module: 1 }) // 1 for CommonJs
    },

    testFramework: 'mocha'
  };
};