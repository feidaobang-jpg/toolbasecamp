/**
 * 图片处理工具
 */
// 全局变量
let selectedImages = [];
let processedImages = [];
let zoomedImage = null;

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const targetWidthInput = document.getElementById('target-width-input');
    const sizeTypeSelect = document.getElementById('size-type-select');
    const clearBtn = document.getElementById('clear-btn');
    const processBtn = document.getElementById('process-btn');
    const saveAllBtn = document.getElementById('save-all-btn');
    const resultContainer = document.getElementById('result-container');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imageSelectionPreview = document.getElementById('image-selection-preview');
    const removeBgCheckbox = document.getElementById('remove-bg-checkbox');
    const trimEdgesCheckbox = document.getElementById('trim-edges-checkbox');

    const API_BASE_URL = window.HomePcApi.base();

    // 旋转状态存储：key为图片索引，value为旋转角度(0, 90, 180, 270)
    let imageRotations = {};

    // 获取拖放区域
    const dropZone = document.querySelector('.drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtnInner = document.getElementById('browse-btn-inner');

    // 绑定事件
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    if (processBtn) processBtn.addEventListener('click', processImages);
    if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllImages);
    if (browseBtnInner) browseBtnInner.addEventListener('click', () => fileInput.click());

    // 处理拖放事件
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drop-zone-hover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drop-zone-hover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drop-zone-hover');
            
            const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
            handleFiles(files);
        });
    }

    // 处理文件选择
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
            handleFiles(files);
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
        
        selectedImages = Array.from(files);
        
        if (typeof showToast === 'function') {
            showToast(`已选择 ${selectedImages.length} 张图片`);
        }
        
        displayImagePreviews();
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
                    
                    // 使用新的画廊预览，传递完整列表和当前索引
                    img.addEventListener('click', () => {
                        // 动态重新构建画廊数据，以包含最新的旋转状态
                        const currentGalleryImages = selectedImages.map((file, idx) => ({
                            dataUrl: galleryImages[idx].dataUrl,
                            name: file.name,
                            rotation: imageRotations[idx] || 0
                        }));

                        if (typeof window.createGalleryModal === 'function') {
                            window.createGalleryModal(currentGalleryImages, i);
                        } else if (typeof createZoomModal === 'function') {
                            createZoomModal(e.target.result);
                        }
                    });
                    previewItem.appendChild(img);
                    
                    // 添加旋转按钮
                    const rotateBtn = document.createElement('button');
                    rotateBtn.className = 'image-rotate-btn';
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
        return '⚠️ 无法连接到后端或 ComfyUI 未启动\n\n' +
               '请确保:\n' +
               '1. ComfyUI 已启动（127.0.0.1:8188）\n' +
               '2. comfyui-api-server 已启动\n' +
               `3. 服务地址 ${API_BASE_URL}/health 显示 comfyui: true\n`;
    }

    /**
     * 核心：处理图片
     */
    async function processImages() {
        if (selectedImages.length === 0) {
            alert('请先选择图片');
            return;
        }

        const targetSize = parseInt(targetWidthInput.value);
        if (isNaN(targetSize) || targetSize <= 0) {
            alert('请输入有效的尺寸');
            return;
        }

        const sizeType = sizeTypeSelect.value; // 'width' 或 'height'
        const shouldRemoveBg = removeBgCheckbox && removeBgCheckbox.checked;
        const shouldTrimEdges = trimEdgesCheckbox && trimEdgesCheckbox.checked;


        // 如果需要移除背景，先检查服务是否可用
        if (shouldRemoveBg) {
            processBtn.disabled = true;
            processBtn.textContent = '检查服务...';
            
            const serverAvailable = await checkServerStatus();
            
            processBtn.disabled = false;
            processBtn.textContent = '开始处理';
            
            if (!serverAvailable) {
                alert(getServiceErrorMsg());
                return;
            }
        }

        try {
            imagePreviewContainer.innerHTML = '';
            processedImages = [];
            saveAllBtn.classList.add('hidden');
            
            // 显示 Loading
            processBtn.disabled = true;
            processBtn.textContent = '处理中...';

            // 改为串行处理，避免并发导致浏览器卡顿或 ComfyUI 队列混乱
            // 同时也为了更好地显示进度
            
            for (let i = 0; i < selectedImages.length; i++) {
                const imageFile = selectedImages[i];
                
                // 更新按钮状态显示进度
                processBtn.textContent = `处理中 ${i + 1}/${selectedImages.length}...`;
                
                try {
                    let resultImage;
                    
                    // 0. 预处理：获取图片数据（如果需要旋转，先旋转）
                    let currentDataUrl = await fileToDataURL(imageFile);
                    const rotation = imageRotations[i] || 0;
                    
                    if (rotation !== 0) {
                        console.log(`[${i+1}/${selectedImages.length}] 应用旋转 ${rotation} 度...`);
                        currentDataUrl = await rotateImageDataUrl(currentDataUrl, rotation);
                    }

                    if (shouldRemoveBg) {
                        // 移除背景
                        console.log(`[${i+1}/${selectedImages.length}] 开始上传并移除背景: ${imageFile.name}`);
                        const bgRemovedImage = await callRemoveBgApi({
                            name: imageFile.name,
                            dataUrl: currentDataUrl
                        });
                        
                        console.log(`[${i+1}/${selectedImages.length}] 移除背景完成，开始缩放...`);
                        resultImage = await resizeImageFromDataUrl(bgRemovedImage.dataUrl, targetSize, bgRemovedImage.name, sizeType, shouldTrimEdges);
                    } else {
                        // 仅缩放
                        resultImage = await resizeImageFromDataUrl(currentDataUrl, targetSize, imageFile.name, sizeType, shouldTrimEdges);
                    }

                    // 处理成功，加入结果列表
                    processedImages.push(resultImage);
                    
                    // 立即显示这张图片的结果（不用等所有都做完）
                    displaySingleResult(resultImage, processedImages.length - 1);
                    
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
                    // 可以选择跳过或用原图占位，这里选择跳过
                }
            }
            
            saveAllBtn.classList.remove('hidden');
            if (typeof showToast === 'function') {
                showToast(`处理完成，成功 ${processedImages.length}/${selectedImages.length} 张`);
            }
            // 积分刷新已移除（媒体工具集不需要登录验证和积分）
            
            // 自动滚动到结果区域
            if (resultContainer && processedImages.length > 0) {
                setTimeout(() => {
                    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
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
     * 显示单张处理结果
     */
    function displaySingleResult(processedImage, index) {
        // 创建预览卡片
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        
        const img = document.createElement('img');
        img.src = processedImage.dataUrl;
        // 绑定点击事件
        img.addEventListener('click', () => {
            if (typeof window.createGalleryModal === 'function') {
                window.createGalleryModal(processedImages, index);
            } else if (typeof createZoomModal === 'function') {
                createZoomModal(processedImage.dataUrl);
            }
        });
        previewItem.appendChild(img);
        
        const bottomContainer = document.createElement('div');
        bottomContainer.className = 'bottom-container';
        previewItem.appendChild(bottomContainer);
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'image-info';
        infoDiv.textContent = `${processedImage.width}x${processedImage.height} (${formatFileSize(processedImage.size)})`;
        bottomContainer.appendChild(infoDiv);
        
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'image-download-btn';
        downloadBtn.textContent = '下载';
        downloadBtn.addEventListener('click', () => {
            downloadImage(processedImage.dataUrl, processedImage.name);
        });
        bottomContainer.appendChild(downloadBtn);
        
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

    // 辅助函数：裁剪透明边缘
    function trimTransparentEdges(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
        
        // 查找非透明像素的边界
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const alpha = data[(y * canvas.width + x) * 4 + 3];
                if (alpha > 0) {
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                    if (x < left) left = x;
                    if (x > right) right = x;
                }
            }
        }
        
        // 如果全是透明的，返回原图
        if (top > bottom || left > right) {
            return { canvas: canvas, width: img.width, height: img.height };
        }
        
        const trimmedWidth = right - left + 1;
        const trimmedHeight = bottom - top + 1;
        
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = trimmedWidth;
        trimmedCanvas.height = trimmedHeight;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        trimmedCtx.drawImage(canvas, left, top, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
        
        return { canvas: trimmedCanvas, width: trimmedWidth, height: trimmedHeight };
    }

    // 辅助函数：从DataURL调整大小
    function resizeImageFromDataUrl(dataUrl, targetSize, fileName, sizeType = 'width', shouldTrim = false) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                let sourceCanvas, sourceWidth, sourceHeight;
                
                // 如果需要裁边
                if (shouldTrim) {
                    const trimmed = trimTransparentEdges(img);
                    sourceCanvas = trimmed.canvas;
                    sourceWidth = trimmed.width;
                    sourceHeight = trimmed.height;
                } else {
                    sourceWidth = img.width;
                    sourceHeight = img.height;
                }
                
                // 根据类型计算目标尺寸
                let targetWidth, targetHeight;
                if (sizeType === 'height') {
                    // 指定高度
                    targetHeight = targetSize;
                    targetWidth = Math.round(sourceWidth * (targetSize / sourceHeight));
                } else {
                    // 指定宽度（默认）
                    targetWidth = targetSize;
                    targetHeight = Math.round(sourceHeight * (targetSize / sourceWidth));
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                const ctx = canvas.getContext('2d');
                // 显式清空画布，确保透明背景
                ctx.clearRect(0, 0, targetWidth, targetHeight);
                
                // 从源绘制（可能是裁剪后的canvas或原图）
                if (shouldTrim && sourceCanvas) {
                    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
                } else {
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                }
                
                const newDataUrl = canvas.toDataURL('image/png'); // 保持png以支持透明
                
                // 计算大小
                const base64 = newDataUrl.split(',')[1];
                const size = Math.round((base64.length * 3) / 4);
                
                // 确保文件名以 .png 结尾
                const safeFileName = fileName.replace(/\.[^/.]+$/, "") + ".png";

                resolve({
                    name: safeFileName,
                    dataUrl: newDataUrl,
                    width: targetWidth,
                    height: targetHeight,
                    size: size,
                    type: 'image/png'
                });
            };
            img.onerror = () => reject(new Error('图片加载失败'));
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
     * 调用后端移除背景 API
     */
    async function callRemoveBgApi(inputImage) {
        // inputImage 包含 name 和 dataUrl
        const blob = dataURLtoBlob(inputImage.dataUrl);
        const formData = new FormData();
        formData.append('image', blob, inputImage.name);
        
        try {
            const response = await fetch(`${API_BASE_URL}/remove-bg`, {
                method: 'POST',
                body: formData
            });

            // 检查502错误
            if (typeof check502Error !== 'undefined' && check502Error(response)) {
                throw new Error('Backend service unavailable');
            }

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const msg = window.HomePcApi && HomePcApi.parseErrorResponse
                    ? HomePcApi.parseErrorResponse(response, data)
                    : ('服务器错误: ' + response.status);
                throw new Error(msg);
            }

            const data = await response.json();
            if (data.success && data.image_data) {
                // 创建一个新的对象返回
                const newImage = { ...inputImage };
                newImage.dataUrl = data.image_data;
                // 文件名改为 png
                newImage.name = newImage.name.replace(/\.[^/.]+$/, "") + ".png";
                
                // 重新计算大小和类型
                const base64 = data.image_data.split(',')[1];
                newImage.size = Math.round((base64.length * 3) / 4);
                newImage.type = 'image/png';
                
                return newImage;
            } else {
                throw new Error(data.error || '未知错误');
            }
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
        if (fileInput) fileInput.value = '';
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
