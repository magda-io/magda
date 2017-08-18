const ftpd = require("ftpd");
const _ = require("lodash");
const URI = require("urijs");
const fs = require("fs");

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
    useReadFile: false,
    logLevel: -1,
    pasvPortRangeStart: 31002,
    pasvPortRangeEnd: 31102
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
            if (server.successes[path]) {
              cb(null, [path]);
            } else {
              cb(null, []);
            }
          },

          stat: (path, cb) => {
            fs.stat("/home", cb);
          }
        });
      } else {
        failure();
      }
    });
  });

  server.listen(30021);

  return server;
};
