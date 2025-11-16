module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'AutomationTests/**',
      'assets/**',
      'media/**',
      'eslint.config.js',
      'eslint.config.cjs',
      '.eslintignore'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {}
  }
];
