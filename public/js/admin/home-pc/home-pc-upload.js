/**
 * Shared drop-zone upload for admin home-pc tools (matches docs-common / instruct-edit UX).
 */
(function () {
  'use strict';

  function filterImages(fileList) {
    if (!fileList || !fileList.length) return [];
    return Array.from(fileList).filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
  }

  window.HomePcUpload = {
    bind: function (opts) {
      var dropZone = opts && opts.dropZone;
      var fileInput = opts && opts.fileInput;
      var onFiles = opts && opts.onFiles;
      var multiple = !opts || opts.multiple !== false;
      if (!dropZone || !fileInput || typeof onFiles !== 'function') return;

      dropZone.addEventListener('click', function () {
        fileInput.click();
      });
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var files = filterImages(e.dataTransfer && e.dataTransfer.files);
        if (!files.length) return;
        onFiles(multiple ? files : [files[0]]);
      });
      fileInput.addEventListener('change', function () {
        var files = filterImages(fileInput.files);
        fileInput.value = '';
        if (!files.length) return;
        onFiles(multiple ? files : [files[0]]);
      });
    },

    syncDropVisible: function (dropZone, hasFiles) {
      if (dropZone) dropZone.hidden = !!hasFiles;
    },

    syncSelectionSection: function (section, hasFiles) {
      if (section) section.hidden = !hasFiles;
    }
  };
})();
