import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/vendor/topconf/reconstruction-*.mjs','src/vendor/topconf/editable-*.mjs','src/vendor/topconf/container-geometry.mjs'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
    },
    plugins: {
      fastfigure: { rules: {
        'component-only-template': {
          meta: { type: 'problem', schema: [], messages: { bare: '界面请使用 components 或 UI 组件，禁止裸 HTML 元素。' } },
          create(context) {
            const services = context.sourceCode.parserServices
            return services.defineTemplateBodyVisitor({
              VElement(node) {
                if (!['template', 'slot', 'component'].includes(node.rawName) && /^[a-z]/.test(node.rawName))
                  context.report({ node, messageId: 'bare' })
              },
            })
          },
        },
      } },
    },
  },
  { files: ['**/*.vue'], rules: { 'fastfigure/component-only-template': 'error' } },
)
