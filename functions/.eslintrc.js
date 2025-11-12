// Caminho: functions/.eslintrc.js

module.exports = {
  env: {
    es2020: true,
    node: true, // Esta linha corrige os erros 'module', 'require' e 'exports'
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  parserOptions: {
    "ecmaVersion": 2020,
  },
  rules: {
    "indent": ["error", 2],
    "quotes": ["error", "double"],
    "max-len": ["error", {"code": 120}],
    "require-jsdoc": "off", // Desliga a necessidade de comentários JSDoc
    "valid-jsdoc": "off", // Desliga a validação de JSDoc
  },
};