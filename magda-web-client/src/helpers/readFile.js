export default function readFile(accept, read = "ArrayBuffer") {
    return new Promise((resolve, reject) => {
        getFiles(accept, false).then((files) => {
            const file = files[0];
            const fileReader = new FileReader();
            fileReader.onloadend = function (e) {
                resolve({ data: e.target.result, file });
            };
            fileReader.onerror = function (e) {
                reject(e);
            };
            fileReader["readAs" + read](file);
        });
    });
}

export function getFiles(accept, multiple = true) {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        if (multiple) {
            input.multiple = true;
        }
        input.click();
        input.onchange = function () {
            resolve(input.files);
        };
    });
}
