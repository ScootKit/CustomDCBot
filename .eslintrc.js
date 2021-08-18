module.exports = {
    'env': {
        'commonjs': true,
        'es2021': true,
        'node': true
    },
    'parserOptions': {
        'ecmaVersion': 12
    },
    'ignorePatterns': ['.eslintrc.js', 'out/'],
    'rules': {
        'no-unused-vars': 'error',
        'accessor-pairs': 'error',
        'array-bracket-newline': 'off',
        'array-bracket-spacing': [
            'error',
            'never'
        ],
        'array-callback-return': 'error',
        'array-element-newline': 'off',
        'arrow-body-style': 'off',
        'arrow-parens': 'off',
        'arrow-spacing': [
            'error',
            {
                'after': true,
                'before': true
            }
        ],
        'block-scoped-var': 'error',
        'block-spacing': 'off',
        'brace-style': [
            'error',
            '1tbs',
            {
                'allowSingleLine': true
            }
        ],
        'camelcase': 'error',
        'capitalized-comments': 'off',
        'class-methods-use-this': 'error',
        'comma-dangle': 'error',
        'comma-spacing': [
            'error',
            {
                'after': true,
                'before': false
            }
        ],
        'comma-style': [
            'error',
            'last'
        ],
        'complexity': 'error',
        'computed-property-spacing': [
            'error',
            'never'
        ],
        'consistent-return': 'off',
        'consistent-this': 'error',
        'curly': 'off',
        'default-case': 'off',
        'default-case-last': 'error',
        'default-param-last': 'error',
        'dot-location': [
            'error',
            'property'
        ],
        "require-jsdoc": ["error", {
            "require": {
                "FunctionDeclaration": true,
                "MethodDefinition": false,
                "ClassDeclaration": true,
                "ArrowFunctionExpression": false,
                "FunctionExpression": false
            }
        }],
        'dot-notation': 'off',
        'eol-last': 'off',
        'eqeqeq': 'error',
        'func-call-spacing': 'error',
        'func-name-matching': 'error',
        'func-names': 'off',
        'func-style': [
            'error',
            'declaration'
        ],
        'function-call-argument-newline': [
            'error',
            'consistent'
        ],
        'function-paren-newline': 'off',
        'generator-star-spacing': 'error',
        'grouped-accessor-pairs': 'error',
        'guard-for-in': 'off',
        'id-denylist': 'error',
        'id-length': 'off',
        'id-match': 'error',
        'implicit-arrow-linebreak': [
            'error',
            'beside'
        ],
        'indent': ['error', 4, {'SwitchCase': 1}
        ],
        'init-declarations': 'off',
        'jsx-quotes': 'error',
        'key-spacing': 'error',
        'keyword-spacing': [
            'error',
            {
                'after': true,
                'before': true
            }
        ],
        'line-comment-position': 'off',
        'linebreak-style': [
            'error',
            'unix'
        ],
        'lines-around-comment': 'error',
        'lines-between-class-members': 'error',
        'max-classes-per-file': 'error',
        'max-depth': 'off',
        'max-len': 'off',
        'max-lines': 'error',
        'max-lines-per-function': 'off',
        'max-nested-callbacks': 'error',
        'max-params': 'off',
        'max-statements': 'off',
        'max-statements-per-line': ['error', {max: 2}],
        'multiline-comment-style': 'error',
        'new-cap': 'error',
        'new-parens': 'error',
        'newline-per-chained-call': 'off',
        'no-alert': 'error',
        'no-array-constructor': 'error',
        'no-await-in-loop': 'off',
        'no-bitwise': [
            'error',
            {
                'int32Hint': true
            }
        ],
        'no-caller': 'error',
        'no-confusing-arrow': 'error',
        'no-console': 'off',
        'no-constructor-return': 'error',
        'no-continue': 'off',
        'no-div-regex': 'error',
        'no-duplicate-imports': 'error',
        'no-else-return': 'off',
        'no-empty-function': 'off',
        'no-eq-null': 'error',
        'no-eval': 'error',
        'no-extend-native': 'error',
        'no-extra-bind': 'error',
        'no-extra-label': 'error',
        'no-extra-parens': 'off',
        'no-floating-decimal': 'error',
        'no-implicit-globals': 'off',
        'no-implied-eval': 'error',
        'no-inline-comments': 'off',
        'no-invalid-this': 'error',
        'no-iterator': 'error',
        'no-label-var': 'error',
        'no-labels': 'error',
        'no-lone-blocks': 'error',
        'no-lonely-if': 'error',
        'no-loop-func': 'off',
        'no-loss-of-precision': 'error',
        'no-magic-numbers': 'off',
        'no-mixed-operators': 'off',
        'no-multi-assign': 'error',
        'no-multi-spaces': 'error',
        'no-multi-str': 'error',
        'no-multiple-empty-lines': 'error',
        'no-negated-condition': 'off',
        'no-nested-ternary': 'error',
        'no-new': 'error',
        'no-new-func': 'error',
        'no-new-object': 'error',
        'no-new-wrappers': 'error',
        'no-nonoctal-decimal-escape': 'error',
        'no-octal-escape': 'error',
        'no-param-reassign': 'off',
        'no-plusplus': 'off',
        'no-promise-executor-return': 'off',
        'no-proto': 'error',
        'no-restricted-exports': 'error',
        'no-restricted-globals': 'error',
        'no-restricted-imports': 'error',
        'no-restricted-properties': 'error',
        'no-restricted-syntax': 'error',
        'no-return-assign': 'off',
        'no-return-await': 'off',
        'no-script-url': 'error',
        'no-self-compare': 'error',
        'no-sequences': 'error',
        'no-shadow': ['error', {'allow': ['err', 'resolve', 'reject']}],
        'no-tabs': 'error',
        'no-template-curly-in-string': 'error',
        'no-ternary': 'off',
        'no-throw-literal': 'error',
        'no-trailing-spaces': 'error',
        'no-undef-init': 'error',
        'no-undefined': 'error',
        'no-underscore-dangle': 'error',
        'no-unmodified-loop-condition': 'error',
        'no-unneeded-ternary': 'error',
        'no-unreachable-loop': 'error',
        'no-unsafe-optional-chaining': 'error',
        'no-unused-expressions': 'error',
        'no-use-before-define': 'off',
        'no-useless-backreference': 'error',
        'no-useless-call': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-concat': 'error',
        'no-useless-constructor': 'error',
        'no-useless-rename': 'error',
        'no-useless-return': 'off',
        'no-var': 'error',
        'no-void': 'error',
        'no-warning-comments': 'off',
        'no-whitespace-before-property': 'error',
        'nonblock-statement-body-position': 'error',
        'object-curly-newline': 'error',
        'object-curly-spacing': 'off',
        'object-shorthand': 'off',
        'one-var': 'off',
        'one-var-declaration-per-line': 'off',
        'operator-assignment': [
            'error',
            'never'
        ],
        'operator-linebreak': 'error',
        'padded-blocks': 'off',
        'padding-line-between-statements': 'error',
        'prefer-arrow-callback': 'off',
        'prefer-const': 'error',
        'prefer-destructuring': 'off',
        'prefer-exponentiation-operator': 'error',
        'prefer-named-capture-group': 'error',
        'prefer-numeric-literals': 'error',
        'prefer-object-spread': 'error',
        'prefer-promise-reject-errors': 'off',
        'prefer-regex-literals': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'prefer-template': 'off',
        'quote-props': 'off',
        'quotes': ['error', 'single', {allowTemplateLiterals: true}],
        'radix': [
            'error',
            'as-needed'
        ],
        'require-atomic-updates': 'off',
        'require-await': 'off',
        'require-unicode-regexp': 'off',
        'rest-spread-spacing': [
            'error',
            'never'
        ],
        'semi': 'error',
        'semi-spacing': [
            'error',
            {
                'after': true,
                'before': false
            }
        ],
        'semi-style': [
            'error',
            'last'
        ],
        'sort-imports': 'error',
        'sort-keys': 'off',
        'sort-vars': 'off',
        'space-before-blocks': 'error',
        'space-before-function-paren': 'off',
        'space-in-parens': 'error',
        'space-infix-ops': 'error',
        'space-unary-ops': [
            'error',
            {
                'nonwords': false,
                'words': true
            }
        ],
        'spaced-comment': [
            'error',
            'always'
        ],
        'strict': [
            'error',
            'never'
        ],
        'switch-colon-spacing': 'error',
        'symbol-description': 'error',
        'template-curly-spacing': [
            'error',
            'never'
        ],
        'template-tag-spacing': 'error',
        'unicode-bom': [
            'error',
            'never'
        ],
        'vars-on-top': 'error',
        'wrap-iife': 'error',
        'wrap-regex': 'error',
        'yield-star-spacing': 'error',
        'yoda': [
            'error'
        ]
    }
};
