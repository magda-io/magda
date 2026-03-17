module.exports = {
    tabWidth: 4,
    singleQuote: false,
    printWidth: 80,
    trailingComma: "none",
    useTabs: false,
    endOfLine: "auto",
    overrides: [
        {
            files: ["**/package.json", "lerna.json"],
            options: {
                tabWidth: 2
            }
        },
        {
            files: [
                "**/*.yml",
                "**/*.yaml",
                "**/.*.yaml",
                "**/.*.yml",
                "**/*.yaml"
            ],
            options: {
                tabWidth: 2
            }
        },
        {
            files: ["**/*.md"],
            options: {
                tabWidth: 2
            }
        }
    ]
};
