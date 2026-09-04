/**
 * 描述抠图工具
 */
// 全局变量
let selectedImages = [];
let processedImages = [];
let zoomedImage = null;

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const clearBtn = document.getElementById('clear-btn');
    const processBtn = document.getElementById('process-btn');
    const saveAllBtn = document.getElementById('save-all-btn');
    const resultContainer = document.getElementById('result-container');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imageSelectionPreview = document.getElementById('image-selection-preview');
    
    const describeInput = document.getElementById('describe-input');
    const outputModeRow = document.getElementById('output-mode-row');

    const API_BASE_URL = window.HomePcApi.base();
    const MediaUi = window.HomePcMediaUi;
    let outputMode = 'cutout';
    let lightboxItems = [];
    let sharedLightbox = null;

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback || key;
    }

    function ensureSharedLightbox() {
        if (!MediaUi) return null;
        if (sharedLightbox) return sharedLightbox;
        MediaUi.ensureLightboxDom();
        sharedLightbox = MediaUi.createLightbox({
            getItems: function () {
                return lightboxItems;
            },
            getHdUrl: function (it) {
                return it && (it.url || it.dataUrl);
            },
            getCaption: function (it, i, n) {
                return ((it && it.name) || '') + ' · #' + (i + 1) + ' / ' + n;
            },
            onBoundary: function (edge) {
                alert(
                    edge === 'first'
                        ? tr('privateHub.homePc.imagePipeLbFirst', '已经是第一张')
                        : tr('privateHub.homePc.imagePipeLbLast', '已经是最后一张')
                );
            }
        });
        return sharedLightbox;
    }

    function openGallery(items, index) {
        lightboxItems = (items || []).map(function (it) {
            return {
                url: it.dataUrl || it.url || '',
                name: it.name || it.kindLabel || ''
            };
        });
        const lb = ensureSharedLightbox();
        if (lb) lb.openAt(index);
    }

    function getOutputMode() {
        return outputMode;
    }

    if (outputModeRow) {
        outputModeRow.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-output-mode]');
            if (!btn) return;
            outputMode = btn.getAttribute('data-output-mode') || 'cutout';
            Array.prototype.forEach.call(outputModeRow.querySelectorAll('[data-output-mode]'), function (el) {
                el.classList.toggle('is-active', el === btn);
            });
        });
    }

    // 旋转状态存储：key为图片索引，value为旋转角度(0, 90, 180, 270)
    let imageRotations = {};

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const selectionPreviewSection = document.getElementById('selection-preview-section');

    function syncUploadUi() {
        if (window.HomePcUpload) {
            HomePcUpload.syncDropVisible(dropZone, selectedImages.length > 0);
            HomePcUpload.syncSelectionSection(selectionPreviewSection, selectedImages.length > 0);
        }
    }

    // 绑定事件
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    if (processBtn) processBtn.addEventListener('click', processImages);
    if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllImages);

    if (window.HomePcUpload) {
        HomePcUpload.bind({
            dropZone: dropZone,
            fileInput: fileInput,
            onFiles: handleFiles,
            multiple: true
        });
    }

    /**
     * 统一处理文件的函数
     */
    function handleFiles(files) {
        if (files.length === 0) return;

        imagePreviewContainer.innerHTML = '';
        imageSelectionPreview.innerHTML = '';
        saveAllBtn.classList.add('hidden');
        processedImages = [];
        imageRotations = {}; // 重置旋转状态

        var list = Array.from(files);
        var finish = function (out) {
            selectedImages = out || list;
            if (typeof showToast === 'function') {
                showToast(`已选择 ${selectedImages.length} 张图片`);
            }
            displayImagePreviews();
            syncUploadUi();
        };

        if (window.TBImageUploadCompress && TBImageUploadCompress.compressMany) {
            TBImageUploadCompress.compressMany(list, 'default').then(finish).catch(function () {
                finish(list);
            });
        } else {
            finish(list);
        }
    }

    /**
     * 截断过长的文件名
     */
    function truncateFilename(filename, maxLength = 10) {
        if (filename.length <= maxLength) {
            return filename;
        }
        return filename.substring(0, maxLength) + '...';
    }

    /**
     * 显示选择的图片预览
     */
    async function displayImagePreviews() {
        imageSelectionPreview.innerHTML = '';
        const previewPromises = [];
        
        // 预先收集所有图片的DataURL，以便画廊预览使用
        const galleryImages = [];
        
        for (let i = 0; i < selectedImages.length; i++) {
            const imageFile = selectedImages[i];
            const previewPromise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    // 初始化旋转状态
                    imageRotations[i] = 0;

                    // 保存到画廊列表
                    galleryImages[i] = {
                        dataUrl: e.target.result,
                        name: imageFile.name
                    };
                    
                    const previewItem = document.createElement('div');
                    previewItem.className = 'image-preview-item';
                    
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.id = `preview-img-${i}`;
                    img.style.transition = 'transform 0.3s ease'; // 添加过渡效果
                    
                    // 使用 HomePcMediaUi lightbox
                    img.addEventListener('click', () => {
                        const currentGalleryImages = selectedImages.map((file, idx) => ({
                            dataUrl: galleryImages[idx] && galleryImages[idx].dataUrl,
                            name: file.name
                        }));
                        openGallery(currentGalleryImages, i);
                    });
                    previewItem.appendChild(img);
                    
                    // 添加旋转按钮
                    const rotateBtn = document.createElement('button');
                    rotateBtn.className = 'tb-btn tb-btn-sm w-full';
                    rotateBtn.textContent = '↻ 旋转';
                    rotateBtn.onclick = function() {
                        const currentRotation = (imageRotations[i] || 0) + 90;
                        imageRotations[i] = currentRotation % 360;
                        img.style.transform = `rotate(${imageRotations[i]}deg)`;
                    };
                    previewItem.appendChild(rotateBtn);

                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'image-info';
                    infoDiv.textContent = `${truncateFilename(imageFile.name)} (${formatFileSize(imageFile.size)})`;
                    previewItem.appendChild(infoDiv);
                    
                    resolve({
                        index: i,
                        element: previewItem
                    });
                };
                reader.readAsDataURL(imageFile);
            });
            previewPromises.push(previewPromise);
        }
        
        const results = await Promise.all(previewPromises);
        results.sort((a, b) => a.index - b.index);
        for (const result of results) {
            imageSelectionPreview.appendChild(result.element);
        }
    }

    /**
     * 获取服务连接失败的错误信息
     */
    function getServiceErrorMsg() {
        return '⚠️ 无法连接到后端服务\n\n' +
               '请确保:\n' +
               '1. ComfyUI API 服务已启动\n' +
               `2. 服务运行在 ${API_BASE_URL}\n`;
    }

    /**
     * 核心：处理图片
     */
    async function processImages() {
        if (selectedImages.length === 0) {
            alert('请先选择图片');
            return;
        }

        const describePrompt = describeInput.value.trim();
        if (!describePrompt) {
            alert('请输入描述要抠出物体的提示词');
            describeInput.focus();
            return;
        }

        // 检查服务是否可用
        processBtn.disabled = true;
        processBtn.textContent = '检查服务...';
        
        const serverAvailable = await checkServerStatus();
        
        processBtn.disabled = false;
        processBtn.textContent = '开始处理';
        
        if (!serverAvailable) {
            alert(getServiceErrorMsg());
            return;
        }

        try {
            imagePreviewContainer.innerHTML = '';
            processedImages = [];
            saveAllBtn.classList.add('hidden');
            
            // 显示 Loading
            processBtn.disabled = true;
            processBtn.textContent = '处理中...';

            // 串行处理
            const batchStart = performance.now();
            for (let i = 0; i < selectedImages.length; i++) {
                const imageFile = selectedImages[i];
                
                // 更新按钮状态显示进度
                processBtn.textContent = `处理中 ${i + 1}/${selectedImages.length}...`;
                
                try {
                    const itemStart = performance.now();
                    // 0. 预处理：获取图片数据（如果需要旋转，先旋转）
                    let currentDataUrl = await fileToDataURL(imageFile);
                    const rotation = imageRotations[i] || 0;
                    
                    if (rotation !== 0) {
                        console.log(`[${i+1}/${selectedImages.length}] 应用旋转 ${rotation} 度...`);
                        currentDataUrl = await rotateImageDataUrl(currentDataUrl, rotation);
                    }

                    // 描述抠图
                    console.log(`[${i+1}/${selectedImages.length}] 开始上传并描述抠图: ${imageFile.name}, 提示词: ${describePrompt}, 模式: ${getOutputMode()}`);
                    const cutoutResults = await callDescribeCutoutApi({
                        name: imageFile.name,
                        dataUrl: currentDataUrl
                    }, describePrompt, getOutputMode());

                    const elapsedSec = (performance.now() - itemStart) / 1000;
                    console.log(`[${i+1}/${selectedImages.length}] 描述抠图完成，耗时 ${elapsedSec.toFixed(1)}s`);
                    cutoutResults.forEach(function (resultImage) {
                        resultImage.elapsed_sec = elapsedSec;
                        processedImages.push(resultImage);
                        displaySingleResult(resultImage, processedImages.length - 1);
                    });
                    
                } catch (err) {
                    console.error(`图片 ${imageFile.name} 处理失败:`, err);
                    
                    // 如果是服务连接错误或服务器内部错误，显示详细提示并中断处理
                    if (err.message.includes('无法连接到后端服务') || err.message.includes('服务器错误')) {
                        alert(err.message);
                        break; // 中断处理循环
                    }
                    
                    // 其他错误显示 toast
                    if (typeof showToast === 'function') {
                        showToast(`处理失败 (${imageFile.name}): ${err.message}`);
                    }
                }
            }

            const batchSec = (performance.now() - batchStart) / 1000;
            console.log(`本批总耗时 ${batchSec.toFixed(1)}s`);
            
            saveAllBtn.classList.remove('hidden');
            if (typeof showToast === 'function') {
                showToast(`处理完成，成功 ${processedImages.length} 张输出，总耗时 ${batchSec.toFixed(1)}s`);
            }
            
        } catch (error) {
            console.error('处理流程异常:', error);
            alert('处理流程异常: ' + error.message);
        } finally {
            processBtn.disabled = false;
            processBtn.textContent = '开始处理';
        }
    }
    
    /**
     * 重新渲染全部处理结果（删除后用）
     */
    function renderProcessedResults() {
        imagePreviewContainer.innerHTML = '';
        processedImages.forEach(function (img, idx) {
            displaySingleResult(img, idx);
        });
        if (processedImages.length) {
            saveAllBtn.classList.remove('hidden');
        } else {
            saveAllBtn.classList.add('hidden');
        }
    }

    /**
     * 显示单张处理结果
     */
    function displaySingleResult(processedImage, index) {
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';

        if (processedImage.kindLabel) {
            const kind = document.createElement('div');
            kind.className = 'image-info';
            kind.style.marginBottom = '6px';
            kind.textContent = processedImage.kindLabel;
            previewItem.appendChild(kind);
        }
        
        const img = document.createElement('img');
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            openGallery(processedImages, index);
        });
        if (processedImage.thumbUrl) {
            img.src = processedImage.thumbUrl;
        } else if (MediaUi && typeof MediaUi.makeThumbDataUrl === 'function') {
            MediaUi.makeThumbDataUrl(processedImage.dataUrl)
                .then(function (thumb) {
                    processedImage.thumbUrl = thumb;
                    img.src = thumb;
                })
                .catch(function () {
                    img.src = processedImage.dataUrl;
                });
        } else {
            img.src = processedImage.dataUrl;
        }
        previewItem.appendChild(img);
        
        const bottomContainer = document.createElement('div');
        bottomContainer.className = 'bottom-container';
        previewItem.appendChild(bottomContainer);
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'image-info';
        
        // 动态获取图片尺寸
        const tempImg = new Image();
        tempImg.onload = function() {
            processedImage.width = tempImg.width;
            processedImage.height = tempImg.height;
            let infoText = `${tempImg.width}x${tempImg.height} (${formatFileSize(processedImage.size)})`;
            if (processedImage.elapsed_sec != null) {
                infoText += ` · ${Number(processedImage.elapsed_sec).toFixed(1)}s`;
            }
            infoDiv.textContent = infoText;
        };
        tempImg.src = processedImage.dataUrl;
        
        bottomContainer.appendChild(infoDiv);

        if (MediaUi) {
            MediaUi.appendCardActions(previewItem, {
                onDownload: function () {
                    downloadImage(processedImage.dataUrl, processedImage.name);
                },
                onDelete: function () {
                    if (
                        !window.confirm(
                            tr('privateHub.homePc.deleteImageConfirm', '确定删除这张图？')
                        )
                    ) {
                        return;
                    }
                    processedImages.splice(index, 1);
                    renderProcessedResults();
                }
            });
        } else {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'tb-btn w-full';
            downloadBtn.textContent = '下载';
            downloadBtn.addEventListener('click', () => {
                downloadImage(processedImage.dataUrl, processedImage.name);
            });
            bottomContainer.appendChild(downloadBtn);
        }
        
        imagePreviewContainer.appendChild(previewItem);
    }

    // 辅助函数：文件转DataURL
    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 辅助函数：旋转图片 DataURL
    function rotateImageDataUrl(dataUrl, degrees) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 处理宽高交换 (90度或270度时)
                if (degrees % 180 !== 0) {
                    canvas.width = img.height;
                    canvas.height = img.width;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(degrees * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    /**
     * 检查后端服务是否可用
     */
    async function checkServerStatus() {
        console.log('正在检查服务状态:', `${API_BASE_URL}/health`);
        
        // 使用 AbortController 实现超时，兼容旧版浏览器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

        try {
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId); // 请求成功，清除定时器

            // 检查502错误
            if (typeof check502Error !== 'undefined' && check502Error(response)) {
                return false;
            }

            console.log('服务检查响应状态:', response.status);
            const body = await response.json().catch(() => ({}));
            if (body.comfyui === false) {
                console.error('ComfyUI 未就绪:', body.comfyui_error || body.message);
                return false;
            }
            if (!response.ok) {
                console.error('服务检查返回非200状态:', response.statusText);
            }
            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId); // 发生错误也要清除定时器
            
            console.error('服务检查发生异常:', err);
            // 区分是否是超时错误
            if (err.name === 'AbortError') {
                console.error('请求超时');
            }
            return false;
        }
    }

    /**
     * 调用后端描述抠图 API
     * @returns {Promise<Array>} 结果图列表（抠图和/或蒙版）
     */
    async function callDescribeCutoutApi(inputImage, prompt, mode) {
        // inputImage 包含 name 和 dataUrl
        const blob = dataURLtoBlob(inputImage.dataUrl);
        const formData = new FormData();
        formData.append('image', blob, inputImage.name);
        formData.append('text_prompt', prompt);
        formData.append('output_mode', mode || 'cutout');
        
        try {
            const response = await fetch(`${API_BASE_URL}/describe-cutout`, {
                method: 'POST',
                body: formData
            });

            // 检查502错误
            if (typeof check502Error !== 'undefined' && check502Error(response)) {
                throw new Error('Backend service unavailable');
            }

            if (!response.ok) {
                let detail = `服务器错误: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.detail) detail = typeof errData.detail === 'string' ? errData.detail : detail;
                } catch (e) { /* ignore */ }
                throw new Error(detail);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || '未知错误');
            }

            const baseName = (inputImage.name || 'cutout').replace(/\.[^/.]+$/, '');
            const results = [];

            function pushFromDataUrl(dataUrl, suffix, kindLabel) {
                if (!dataUrl) return;
                const base64 = dataUrl.split(',')[1] || '';
                results.push({
                    name: `${baseName}_${suffix}.png`,
                    dataUrl: dataUrl,
                    size: Math.round((base64.length * 3) / 4),
                    type: 'image/png',
                    kindLabel: kindLabel
                });
            }

            if (data.image_data) {
                pushFromDataUrl(data.image_data, 'cutout', '抠图');
            }
            if (data.mask_image_data) {
                pushFromDataUrl(data.mask_image_data, 'mask', '蒙版');
            }
            if (!results.length) {
                throw new Error('未返回图片数据');
            }
            return results;
        } catch (err) {
            console.error("API调用失败", err);
            
            // 如果是502错误，已经显示弹窗
            if (err.message === 'Backend service unavailable') {
                throw err;
            }
            
            // 检测是否是网络错误（服务未启动）
            if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
                throw new Error(getServiceErrorMsg());
            }
            
            throw err; // 向上传递其他错误
        }
    }

    // 工具函数：DataURL 转 Blob
    function dataURLtoBlob(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    function clearAll() {
        selectedImages = [];
        processedImages = [];
        imageRotations = {}; // 重置旋转
        imageSelectionPreview.innerHTML = '';
        imagePreviewContainer.innerHTML = '';
        saveAllBtn.classList.add('hidden');
        if (describeInput) describeInput.value = '';
        if (fileInput) fileInput.value = '';
        syncUploadUi();
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 下载图片
    function downloadImage(dataUrl, filename) {
        if (MediaUi && typeof MediaUi.triggerDownload === 'function') {
            MediaUi.triggerDownload(dataUrl, filename).catch(function () { /* ignore */ });
            return;
        }
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // 批量保存
    function saveAllImages() {
        if (processedImages.length === 0) return;

        // 如果 JSZip 可用，则打包下载
        if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            
            processedImages.forEach(img => {
                // 将 DataURL 转为 Blob
                const blob = dataURLtoBlob(img.dataUrl);
                zip.file(img.name, blob);
            });
            
            // 生成时间戳文件名
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const zipFilename = `${year}-${month}-${day}_${hour}-${minute}.zip`;
            
            zip.generateAsync({type: "blob"})
            .then(function(content) {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = zipFilename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        } else {
            // 降级：逐个下载
            alert('打包组件加载失败(可能是网络原因)，将为您逐个下载图片。');
            processedImages.forEach(img => {
                downloadImage(img.dataUrl, img.name);
            });
        }
    }
    
    // 全局函数（用于在 base.js 中定义的 showToast 或 createZoomModal，如果不可用则降级处理）
    window.showToast = window.showToast || ((msg) => console.log(msg));
});
