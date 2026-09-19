/* eslint-env node */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'plugins/**/*.js'],
  },
  {
    rules: {
      'react/display-name': 'off',
      // These React Compiler diagnostics were enabled by the SDK 57 lint
      // upgrade. Migrate the existing codebase deliberately before enforcing
      // them; keep the established Hooks correctness rules active meanwhile.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // Machine enforcement of CLAUDE.md rules 2 & 4 (warn first; raise to error once clean).
    files: ['**/*.{ts,tsx}'],
    ignores: [
      'constants/**',
      'context/ThemeContext.tsx',
      'components/themed/**',
      '__tests__/**',
      'scripts/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Raw hex color — use useTheme() palette or DesignSystem tokens (CLAUDE.md rule 4).',
        },
        {
          selector: "Property[key.name='fontSize'] > Literal.value",
          message: 'Raw fontSize — use Typography tokens via ThemedText (CLAUDE.md rule 2).',
        },
      ],
    },
  },
]);
