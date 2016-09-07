export default function (url, options) {
  var CALLBACK_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

    return new Promise(function (resolve, reject) {
      var callback;
      while (!callback || window[callback] !== undefined) {
        callback = 'JSONP_';
        for (var i = 0; i < 10; i++) {
          callback += CALLBACK_CHARS[Math.random() * CALLBACK_CHARS.length | 0];
        }
      }

      var script = document.createElement('script');
      script.src = url + callback;
      document.body.appendChild(script);

      function cleanup() {
        delete window[callback];
        script.remove();
      }

      var ticket = setTimeout(function () {
        reject('no response');
        cleanup();
      },  options.timeout);

      window[callback] = function (data) {
        resolve(data);
        clearTimeout(ticket);
        cleanup();
      };
    });
  }
};
