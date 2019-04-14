export default function readFile(accept, read = "ArrayBuffer") {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.click();
        input.onchange = function() {
            const file = input.files[0];
            const fileReader = new FileReader();
            fileReader.onloadend = function(e) {
                resolve({ data: e.target.result, file });
            };
            fileReader.onerror = function(e) {
                reject(e);
            };
            fileReader["readAs" + read](file);
        };
    });
}
