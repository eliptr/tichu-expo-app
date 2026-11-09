const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const babel = require('@babel/core');

const srcRoot = path.join(__dirname, '..', 'src');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, ...args) {
  const filename = request.startsWith('@/') ? path.join(srcRoot, request.slice(2)) : request;
  return resolveFilename.call(this, filename, ...args);
};

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
    sourceMaps: 'inline',
  });
  module._compile(result.code, filename);
};
