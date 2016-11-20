export default function (url, updateProgress, transferFailed) {
    return new Promise(function(resolve, reject) {
      let xhr = new XMLHttpRequest();

      if(updateProgress && typeof updateProgress === 'function'){
        xhr.addEventListener("progress", updateProgress);
      }

      if(transferFailed && typeof transferFailed === 'function'){
        xhr.addEventListener("error", transferFailed);
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
