const ftpd = require("ftpd");
const _ = require("lodash");
const URI = require("urijs");

module.exports = function createFtpServer() {
  const server = new ftpd.FtpServer("127.0.0.1", {
    getInitialCwd: function() {
      return "/";
    },
    getRoot: function() {
      return "/";
    },
    allowUnauthorizedTls: true,
    useWriteFile: false,
    useReadFile: false
    // uploadMaxSlurpSize: 7000 // N/A unless 'useWriteFile' is true.
  });

  server.on("error", function(error) {
    console.error("FTP Server error:", error);
  });

  server.on("client:connected", function(connection) {
    var username = null;
    connection.on("command:user", function(user, success, failure) {
      if (user) {
        username = user;
        success();
      } else {
        failure();
      }
    });

    connection.on("command:pass", function(pass, success, failure) {
      if (pass) {
        success(username, {
          readdir: (path, cb) => {
            const success = server.successes[path];

            console.log(server.successes);
            console.log(path);

            // console.log(
            //   _(server.successes)
            //     .map((value, key) => {
            //       return {
            //         path: new URI(key).path(),
            //         value
            //       };
            //     })
            //     .value()
            // );

            if (success) {
              cb(null, ["file1.txt"]);
            } else {
              cb(null, []);
            }
          },

          stat: (path, callback) => {
            callback(null, {
              isFile: () => true,
              isDirectory: () => false,
              isBlockDevice: () => true,
              dev: 2114,
              ino: 48064969,
              mode: 33188,
              nlink: 1,
              uid: 85,
              gid: 100,
              rdev: 0,
              size: 527,
              blksize: 4096,
              blocks: 8,
              atimeMs: 1318289051000.1,
              mtimeMs: 1318289051000.1,
              ctimeMs: 1318289051000.1,
              birthtimeMs: 1318289051000.1,
              atime: "Mon, 10 Oct 2011 23:24:11 GMT",
              mtime: "Mon, 10 Oct 2011 23:24:11 GMT",
              ctime: "Mon, 10 Oct 2011 23:24:11 GMT",
              birthtime: "Mon, 10 Oct 2011 23:24:11 GMT"
            });
          }
        });
      } else {
        failure();
      }
    });
  });

  server.debugging = 4;
  server.listen(30021);

  return server;
};
