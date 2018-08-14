const Pwgen = require("pwgen/lib/pwgen_module");

const pwgenGenerator = new Pwgen();
pwgenGenerator.includeCapitalLetter = true;
pwgenGenerator.includeNumber = true;
pwgenGenerator.maxLength = 16;

function generatePassword(
    maxLength,
    includeCapitalLetter = true,
    includeNumber = true
) {
    return pwgenGenerator.generate();
}

module.exports = generatePassword;
