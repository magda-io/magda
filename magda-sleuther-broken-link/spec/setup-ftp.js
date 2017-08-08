const ftpd = require("ftpd");

module.exports = function createFtpServer() {
  const server = new ftpd.FtpServer("127.0.0.1", {
    getInitialCwd: function() {
      return "/";
    },
    getRoot: function() {
      return process.cwd();
    },
    allowUnauthorizedTls: true,
    useWriteFile: false,
    useReadFile: false,
    // uploadMaxSlurpSize: 7000 // N/A unless 'useWriteFile' is true.
  });

  server.on("error", function(error) {
    console.info("FTP Server error:", error);
  });

  server.on("client:connected", function(connection) {
    console.info("FTP connected");
    var username = null;
    console.info("client connected: " + connection.remoteAddress);
    connection.on("command:user", function(user, success, failure) {
      console.info("FTP command:user");
      if (user) {
        username = user;
        success();
      } else {
        failure();
      }
    });

    connection.on("command:pass", function(pass, success, failure) {
      console.info("FTP in use!!!!");
      if (pass) {
        success(username, {
          readdir: (path, cb) => {
            cb(null, ["file1.txt", "file2.txt"]);
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
  console.info("Listening on port 21");

  return server;
};
