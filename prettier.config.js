module.exports = {
    tabWidth: 4,
    singleQuote: false,
    printWidth: 80,
    trailingComma: "none",
    useTabs: false,
    overrides: [
        {
            files: "**/package.json",
            options: {
                tabWidth: 2
            }
        }
    ]
};
