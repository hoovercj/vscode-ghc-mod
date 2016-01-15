module.exports = function (w) {

  return {
    files: [
      'src/*.ts'
    ],

    tests: [
      'test/*.ts'
    ],

    env: {
      type: 'node'
    },
    
    testFramework: 'mocha'
    
    // compilers: {
    //   '**/*.ts': w.compilers.typeScript({module: 1}) // 1 for CommonJs
    // }

    // By default TypeScript compiler renames .coffee files to .js files.
    // If you'd like to not do it and for example use your own renaming strategy,
    // you may pass 'noRename' option to TS compiler
    //  '**/*.ts': w.compilers.typeScript({ noRename: true })
    // and may use preprocessors to rename files the way you like:
    //preprocessors: {
    //  '**/*.ts': file => file.rename(file.path + '.js').content
    //}

  };
};