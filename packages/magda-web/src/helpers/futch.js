export default function (url, updateProgress) {
    return new Promise(function(resolve, reject) {
      let xhr = new XMLHttpRequest();
      xhr.open('get', url, true);
      xhr.responseType = 'json';

      if(updateProgress && typeof updateProgress === 'function'){
        xhr.addEventListener("progress", updateProgress);
      }

      xhr.onload = function() {
        let status = xhr.status;
        let json = typeof xhr.response === 'string' || xhr.response instanceof String ? JSON.parse(xhr.response) : xhr.response;
        if (status === 200) {
          resolve(json);
        } else {
          let errorMessage = `Error: ${status} : ${json.errorMessage}`
          reject(errorMessage);
        }
      };
      xhr.send();
    });
}
