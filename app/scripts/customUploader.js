document.addEventListener("DOMContentLoaded", function () {
    'use strict';

    // We can attach the `fileselect` event to all file inputs on the page
    Array.prototype.forEach.call(document.querySelectorAll("input[type=file]"), function (fileInput) {
        fileInput.addEventListener("change", function () {
            var nameContainer = fileInput.parentNode.parentNode.parentNode.querySelector("input[type=text]");
            nameContainer.value = fileInput.value.split(/[\\\/]/g).pop();
        })
    });
});