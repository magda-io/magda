export default function (url, updateProgress, transferComplete, transferFailed, transferCanceled) {
    return new Promise(function(resolve, reject) {
      let xhr = new XMLHttpRequest();

      if(updateProgress && typeof updateProgress === 'function'){
        xhr.addEventListener("progress", updateProgress);
      }

      xhr.open('get', url, true);
      xhr.responseType = 'json';
      xhr.onload = function() {
        let status = xhr.status;
        if (status === 200) {
          resolve(xhr.response);
        } else {
          reject(status);
        }
      };
      xhr.send();
    });
}
