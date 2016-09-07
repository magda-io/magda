export default function (url, updateProgress, transferComplete, transferFailed, transferCanceled) {
    return new Promise(function(resolve, reject) {
      let xhr = new XMLHttpRequest();

      updateProgress && xhr.addEventListener("progress", updateProgress);
      transferComplete && xhr.addEventListener("load", transferComplete);
      transferFailed && xhr.addEventListener("error", transferFailed);
      transferCanceled && xhr.addEventListener("abort", transferCanceled);

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
