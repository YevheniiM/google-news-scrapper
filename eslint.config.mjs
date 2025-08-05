import { apifyConfig } from '@apify/eslint-config';

export default [
    ...apifyConfig,
    {
        rules: {
            // Customize rules as needed
            'no-console': 'off',
            'import/extensions': ['error', 'ignorePackages'],
        },
    },
];
