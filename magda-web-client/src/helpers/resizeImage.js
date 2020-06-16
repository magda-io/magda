export default function resizeImage(img, width, height) {
    const canvas = document.createElement("canvas");
    canvas.style.border = "1px solid black";
    // document.body.appendChild(canvas);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageAspect = img.width / img.height;
    const targetAspect = width / height;
    let x = 0,
        y = 0,
        dx = width,
        dy = height;
    if (imageAspect < targetAspect) {
        dy = img.height * (dx / img.width);
        y = (height - dy) / 2;
    } else if (imageAspect > targetAspect) {
        dx = img.width * (height / img.height);
        y = (width - dx) / 2;
    }
    ctx.drawImage(img, x, y, dx, dy); // destination rectangle
    return dataURItoBlob(canvas.toDataURL("image/jpeg", 90));
}

// https://stackoverflow.com/questions/12168909/blob-from-dataurl
function dataURItoBlob(dataURI) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = atob(dataURI.split(",")[1]);

    // separate out the mime component
    var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

    // write the bytes of the string to an ArrayBuffer
    var ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    var ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    var blob = new Blob([ab], {
        type: mimeString
    });
    return blob;
}
