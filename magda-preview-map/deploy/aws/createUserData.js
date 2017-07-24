var fs = require('fs');

if (process.argv.length < 4) {
    console.error('createUserData <user data filename> <deployment name>');
    process.exit(1);
}

var userDataTemplate = fs.readFileSync(process.argv[2], 'utf8');
var userData = userDataTemplate.replace(/{{deploymentName}}/g, process.argv[3]);
process.stdout.write(new Buffer(userData).toString('base64'));
