/**
 * 老照片修复工具
 */
// 全局变量
let selectedImages = [];
let processedImages = [];
let zoomedImage = null;

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const clearBtn = document.getElementById('clear-btn');
    const processBtn = document.getElementById('process-btn');
    const cancelBtn = document.getElementById('cancel-btn'); // 新增取消按钮
    const saveAllBtn = document.getElementById('save-all-btn');
    const resultContainer = document.getElementById('result-container');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imageSelectionPreview = document.getElementById('image-selection-preview');
    
    const enableWatermarkCheckbox = document.getElementById('enable-watermark');
    const watermarkTextGroup = document.getElementById('watermark-text-group');
    const watermarkInput = document.getElementById('watermark-text');

    // 进度条元素
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPercent = document.getElementById('progress-percent');

    const API_BASE_URL = window.HomePcApi.base();

    function getWebSocketUrl() {
        return window.HomePcApi.wsUrl('/ws/photo-restore');
    }

    // 旋转状态存储
    let imageRotations = {};

    // 获取拖放区域
    const dropZone = document.querySelector('.drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtnInner = document.getElementById('browse-btn-inner');

    // 绑定事件
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    if (processBtn) processBtn.addEventListener('click', processImages);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelProcessing); // 绑定取消事件
    if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllImages);
    if (browseBtnInner) browseBtnInner.addEventListener('click', () => fileInput.click());
    
    // 水印开关联动
    if (enableWatermarkCheckbox) {
        enableWatermarkCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                watermarkTextGroup.style.display = 'flex';
                watermarkTextGroup.style.opacity = '1';
            } else {
                watermarkTextGroup.style.display = 'none';
                watermarkTextGroup.style.opacity = '0';
            }
        });
    }

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

    // 全局控制变量
    let isProcessingCancelled = false;
    let activeWebSocket = null;
    let currentProgressInterval = null; // 全局进度定时器
    let globalAbortController = null; // 用于取消 fetch 请求
    let processingStartTime = null; // 全局开始时间，用于计算总耗时

    async function cancelProcessing() {
        // if (!confirm('确定要取消当前任务吗？')) return; // 移除确认弹窗，点击即取消
        
        console.log('用户点击取消任务');
        isProcessingCancelled = true;
        processingStartTime = null; // 重置计时

        // 0. 取消所有正在进行的 fetch 请求 (如上传图片)
        if (globalAbortController) {
            console.log('Abort ongoing fetch requests...');
            globalAbortController.abort();
            globalAbortController = null;
        }

        // 1. 发送中断请求给后端 (新增)
        try {
            console.log('正在发送中断请求给后端...');
            if (typeof showToast === 'function') {
                showToast('正在向服务器发送终止指令...');
            }
            
            // 使用 fetch 发送 POST 请求到 /interrupt
            const interruptUrl = `${API_BASE_URL}/interrupt`;
            console.log(`Interrupt URL: ${interruptUrl}`);
            
            fetch(interruptUrl, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        return res.json();
                    }
                    throw new Error(`HTTP error! status: ${res.status}`);
                })
                .then(data => {
                    console.log('中断请求响应:', data);
                    if (typeof showToast === 'function') {
                        showToast('服务器已确认终止任务', 'success');
                    }
                })
                .catch(err => {
                    console.error('中断请求失败:', err);
                    if (typeof showToast === 'function') {
                        showToast(`终止指令发送失败: ${err.message}`, 'error');
                    }
                });
        } catch (e) {
            console.error('发送中断请求异常:', e);
        }
        
        // 2. 关闭当前的 WebSocket 连接
        if (activeWebSocket) {
            console.log('正在手动关闭 WebSocket...');
            activeWebSocket.close();
            activeWebSocket = null;
        }

        // 3. 确保清除进度定时器
        if (currentProgressInterval) {
            console.log('全局清除进度定时器');
            clearInterval(currentProgressInterval);
            currentProgressInterval = null;
        }

        // 4. 立即更新UI
        if (progressBar) {
            progressBar.style.backgroundColor = '#f56c6c'; // 变红
            // 不要设置宽度为100%，否则用户会以为完成了
            // progressBar.style.width = '100%'; 
        }
        
        // 强制更新状态文字
        console.log('执行 UI 强制更新: 任务已取消');
        updateProgress(undefined, '已停止', true);
        
        // 注意：不要在这里重新启用开始按钮，等待 processImages 的 finally 块执行
        // 这样可以防止在清理完成前用户再次点击开始导致竞态条件
        // processBtn.disabled = false;
        // processBtn.textContent = '开始修复';
        // cancelBtn.disabled = true; // 禁用取消按钮
        
        if (typeof showToast === 'function') {
            showToast('任务已手动取消');
        }
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
        const galleryImages = [];
        
        for (let i = 0; i < selectedImages.length; i++) {
            const imageFile = selectedImages[i];
            const previewPromise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    imageRotations[i] = 0;
                    
                    galleryImages[i] = {
                        dataUrl: e.target.result,
                        name: imageFile.name
                    };
                    
                    const previewItem = document.createElement('div');
                    previewItem.className = 'image-preview-item';
                    
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.id = `preview-img-${i}`;
                    img.style.transition = 'transform 0.3s ease';
                    
                    img.addEventListener('click', () => {
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
        return '⚠️ 无法连接到后端服务\n\n' +
               '请确保:\n' +
               '1. ComfyUI API 服务已启动\n' +
               `2. 服务运行在 ${API_BASE_URL}\n`;
    }

    /**
     * 更新进度条
     */
    function updateProgress(percent, status, force = false) {
        if (isProcessingCancelled && !force) {
            console.warn(`[Blocked] updateProgress called but cancelled. Percent: ${percent}, Status: ${status}`);
            return;
        }

        if (progressContainer.classList.contains('hidden')) {
            progressContainer.classList.remove('hidden');
        }
        
        if (percent !== undefined) {
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${percent}%`;
        }
        
        if (status) {
            let displayStatus = status;
            // 如果正在计时，且状态文本中不包含"耗时"字样（避免重复），则追加时间
            if (processingStartTime && !status.includes('耗时')) {
                const elapsed = ((Date.now() - processingStartTime) / 1000).toFixed(1);
                displayStatus += ` (已用时 ${elapsed}s)`;
            }
            progressStatus.textContent = displayStatus;
        }
    }

    function resetProgress() {
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressStatus.textContent = '准备中...';
    }

    /**
     * 上传图片
     */
    async function uploadImage(file, signal) {
        const formData = new FormData();
        formData.append('image', file);

        // 注意：这里使用 /upload 接口 (app.py 中新增的)
        // 使用 API_BASE_URL 拼接，兼容本地和远程
        const uploadUrl = `${API_BASE_URL}/upload`;
        
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            signal: signal
        });

        // 检查502错误
        if (typeof check502Error !== 'undefined' && check502Error(response)) {
            throw new Error('Backend service unavailable');
        }

        if (!response.ok) {
            let errorMsg = `上传失败: ${response.status}`;
            try {
                const errData = await response.json();
                if (errData.detail) {
                    errorMsg = errData.detail;
                }
            } catch (e) {
                // 忽略非 JSON 响应体
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.detail || '上传失败');
        }
        return data.filename;
    }

    /**
     * 通过 WebSocket 处理单张图片
     */
    function processImageViaWebSocket(filename, originalName, enableWatermark, watermarkText) {
        return new Promise((resolve, reject) => {
            const wsUrl = getWebSocketUrl();
            const ws = new WebSocket(wsUrl);
            activeWebSocket = ws; // 保存引用以便取消
            
            let isComplete = false;
            // let progressInterval = null; // 不再使用局部变量，改用 ws._progressInterval

            // 模拟进度条增长
            function startSimulateProgress() {
                let current = 10;
                // 清除可能存在的旧定时器
                if (currentProgressInterval) clearInterval(currentProgressInterval);
                
                currentProgressInterval = setInterval(() => {
                    // 如果已取消，停止模拟
                    if (isProcessingCancelled) {
                        console.warn('[Interval] Detected cancellation, stopping simulation.');
                        stopSimulateProgress();
                        return;
                    }
                    if (current < 95) {
                        // 越往后越慢
                        const increment = current < 60 ? 2 : (current < 80 ? 1 : 0.5);
                        current += increment;
                        // 只有当没有收到真实进度时才更新模拟进度（这里简化处理，直接更新，真实进度来了会覆盖）
                        // 为了避免模拟进度覆盖了真实的更高进度，我们可以加个判断，但简单起见，
                        // 我们让 updateProgress 内部处理：如果新进度小于当前显示进度且不是重置，则不更新？
                        // 或者直接更新，因为模拟进度是平滑的。
                        updateProgress(Math.floor(current), `处理中... ${Math.floor(current)}%`);
                    }
                }, 1000); // 每秒更新一次
            }

            function stopSimulateProgress() {
                if (currentProgressInterval) {
                    clearInterval(currentProgressInterval);
                    currentProgressInterval = null;
                }
            }

            ws.onopen = () => {
                if (isProcessingCancelled) {
                    ws.close();
                    return;
                }
                console.log('WS 连接已建立');
                // 发送初始化数据
                ws.send(JSON.stringify({
                    filename: filename,
                    enable_watermark: enableWatermark,
                    watermark_text: watermarkText
                }));
                // 开始模拟进度
                startSimulateProgress();
            };

            ws.onmessage = (event) => {
                // 如果已取消，忽略所有消息
                if (isProcessingCancelled) return;

                try {
                    const msg = JSON.parse(event.data);
                    // console.log('WS Received:', msg); // 调试日志
                    
                    if (msg.type === 'ping') {
                        console.log('WS 心跳保持...');
                        return;
                    }

                    if (msg.type === 'progress') {
                        // 收到真实进度，更新
                        if (currentProgressInterval) clearInterval(currentProgressInterval);
                        
                        updateProgress(msg.percent, `处理中... ${msg.percent}%`);
                        
                        // 重新启动模拟，从当前进度开始，但只有在很长时间没消息时才有用
                        // 简单起见，收到真实进度就不模拟了，除非再次长时间卡顿。
                        // 这里我们选择：收到第一个真实进度后，就完全依赖真实进度。
                        
                    } else if (msg.type === 'status') {
                        updateProgress(undefined, msg.message);
                    } else if (msg.type === 'complete') {
                        stopSimulateProgress();
                        isComplete = true;
                        // 构建结果对象
                        const result = {
                            name: originalName.replace(/\.[^/.]+$/, "") + ".png",
                            processedDataUrl: msg.image_data,
                            watermarkedDataUrl: msg.watermarked_image_data
                        };
                        resolve(result);
                        ws.close();
                    } else if (msg.type === 'error') {
                        stopSimulateProgress();
                        reject(new Error(msg.message));
                        ws.close();
                    }
                } catch (e) {
                    console.error('WS 解析错误:', e);
                }
            };

            ws.onerror = (error) => {
                stopSimulateProgress();
                console.error('WS 错误:', error);
                reject(new Error('WebSocket 连接错误'));
            };

            ws.onclose = (event) => {
                stopSimulateProgress();
                console.log('WS 连接关闭', event.code, event.reason);
                if (!isComplete) {
                    let errorMsg = event.reason || '连接意外断开';
                    if (event.code === 1006) {
                        errorMsg += ' (1006)。线上环境请检查 Nginx 是否配置了 WebSocket 代理 (Upgrade/Connection 头)';
                    }
                    reject(new Error(errorMsg));
                }
            };
        });
    }

    /**
     * 核心：处理图片
     */
    async function processImages() {
        if (selectedImages.length === 0) {
            alert('请先选择图片');
            return;
        }

        const enableWatermark = enableWatermarkCheckbox.checked;
        const watermarkText = watermarkInput.value.trim();
        
        if (enableWatermark && !watermarkText) {
            alert('请输入水印文字');
            watermarkInput.focus();
            return;
        }

        // 检查服务是否可用
        processBtn.disabled = true;
        processBtn.textContent = '检查服务...';
        
        const serverAvailable = await checkServerStatus();
        
        processBtn.disabled = false;
        processBtn.textContent = '开始修复';
        
        if (!serverAvailable) {
            alert(getServiceErrorMsg());
            return;
        }

        try {
            imagePreviewContainer.innerHTML = '';
            processedImages = [];
            saveAllBtn.classList.add('hidden');
            
            // 初始化 AbortController
            globalAbortController = new AbortController();

            // 重置取消状态
            isProcessingCancelled = false;
            cancelBtn.disabled = false; // 启用取消按钮
            
            processBtn.disabled = true;
            processBtn.textContent = '修复中...';
            resetProgress(); // 重置进度条

            processingStartTime = Date.now(); // 设置全局开始时间

            for (let i = 0; i < selectedImages.length; i++) {
                // 检查是否已取消
                if (isProcessingCancelled) {
                    console.log('处理循环被中断');
                    break;
                }

                const imageFile = selectedImages[i];
                processBtn.textContent = `修复中 ${i + 1}/${selectedImages.length}...`;
                
                // 更新总体状态 (updateProgress 会自动追加时间)
                updateProgress(0, `正在处理第 ${i + 1}/${selectedImages.length} 张: ${truncateFilename(imageFile.name)}`);

                try {
                    // 检查是否已取消
                    if (isProcessingCancelled) break;

                    // 1. 预处理旋转 (如果需要)
                    // 注意：这里的旋转目前只是前端预览旋转，如果后端需要处理旋转，需要传递 rotation 参数
                    // 目前后端没处理旋转，这里只是为了获取 dataUrl 给前端展示用? 
                    // 不，之前的逻辑是将旋转后的 dataUrl 直接发给后端。
                    // 现在的上传逻辑是直接上传 file 对象。如果用户旋转了，我们需要上传旋转后的图片。
                    
                    let uploadFile = imageFile;
                    const rotation = imageRotations[i] || 0;
                    
                    if (rotation !== 0) {
                        // 如果有旋转，需要将旋转后的 Canvas 转回 Blob/File
                        console.log('应用旋转...');
                        updateProgress(undefined, '正在应用旋转...');
                        const currentDataUrl = await fileToDataURL(imageFile);
                        const rotatedDataUrl = await rotateImageDataUrl(currentDataUrl, rotation);
                        const blob = dataURLtoBlob(rotatedDataUrl);
                        uploadFile = new File([blob], imageFile.name, { type: 'image/png' });
                    }

                    if (isProcessingCancelled) break;

                    // 2. 上传图片
                    console.log(`[${i+1}/${selectedImages.length}] 上传图片: ${imageFile.name}`);
                    updateProgress(10, '正在上传图片...');
                    const serverFilename = await uploadImage(uploadFile, globalAbortController.signal);

                    if (isProcessingCancelled) break;

                    // 3. WebSocket 处理
                    console.log(`[${i+1}/${selectedImages.length}] 开始修复任务...`);
                    // updateProgress 由 WebSocket 消息驱动
                    
                    const result = await processImageViaWebSocket(serverFilename, imageFile.name, enableWatermark, watermarkText);

                    console.log(`[${i+1}/${selectedImages.length}] 修复完成`);
                    
                    // 将结果加入列表
                    processedImages.push(result);
                    
                    // 显示结果
                    displaySingleResult(result, processedImages.length - 1);
                    
                } catch (err) {
                    if (isProcessingCancelled) {
                        console.log('任务取消，忽略错误');
                        break;
                    }
                    console.error(`图片 ${imageFile.name} 处理失败:`, err);
                    updateProgress(0, `出错: ${err.message}`);
                    
                    if (err.message.includes('无法连接到后端服务') || err.message.includes('服务器错误')) {
                        alert(err.message);
                        break;
                    }
                    
                    if (typeof showToast === 'function') {
                        showToast(`处理失败 (${imageFile.name}): ${err.message}`);
                    }
                    // 继续处理下一张
                }
            }
            
            saveAllBtn.classList.remove('hidden');
            const totalTime = processingStartTime ? ((Date.now() - processingStartTime) / 1000).toFixed(1) : '0.0';
            updateProgress(100, `所有图片处理完成，总耗时 ${totalTime}秒`);
            
            if (typeof showToast === 'function') {
                showToast(`处理完成，成功 ${processedImages.length}/${selectedImages.length} 张，总耗时 ${totalTime}s`);
            }
            // 积分刷新已移除（媒体工具集不需要登录验证和积分）
            
            if (resultContainer && processedImages.length > 0) {
                setTimeout(() => {
                    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
            }
            
        } catch (error) {
            // 如果是 AbortError，说明是主动取消，不视为异常
            if (error.name === 'AbortError' || isProcessingCancelled) {
                console.log('处理流程已取消');
            } else {
                console.error('处理流程异常:', error);
                alert('处理流程异常: ' + error.message);
            }
        } finally {
            processBtn.disabled = false;
            processBtn.textContent = '开始修复';
            cancelBtn.disabled = true; // 禁用取消按钮
            activeWebSocket = null;
            globalAbortController = null;
            // 稍后隐藏进度条
            // setTimeout(() => progressContainer.classList.add('hidden'), 5000);
        }
    }
    
    /**
     * 显示单张处理结果
     */
    function displaySingleResult(resultItem, index) {
        // resultItem 结构: { name, processedDataUrl, watermarkedDataUrl, ... }
        
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        
        // 默认显示无水印版
        let currentUrl = resultItem.processedDataUrl;
        let isWatermarkShown = false;
        
        const img = document.createElement('img');
        img.src = currentUrl;
        
        // 点击预览
        img.addEventListener('click', () => {
            const galleryList = [];
            // 构建查看列表
            galleryList.push({
                dataUrl: resultItem.processedDataUrl,
                name: "修复版-" + resultItem.name
            });
            if (resultItem.watermarkedDataUrl) {
                galleryList.push({
                    dataUrl: resultItem.watermarkedDataUrl,
                    name: "水印版-" + resultItem.name
                });
            }
            
            if (typeof window.createGalleryModal === 'function') {
                // 如果当前显示的是水印版，打开时定位到水印版 (索引 1)
                window.createGalleryModal(galleryList, isWatermarkShown ? 1 : 0);
            } else if (typeof createZoomModal === 'function') {
                createZoomModal(img.src);
            }
        });
        previewItem.appendChild(img);
        
        const bottomContainer = document.createElement('div');
        bottomContainer.className = 'bottom-container';
        previewItem.appendChild(bottomContainer);
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'image-info';
        
        // 获取尺寸
        const tempImg = new Image();
        tempImg.onload = function() {
            infoDiv.textContent = `${tempImg.width}x${tempImg.height}`;
        };
        tempImg.src = currentUrl;
        
        bottomContainer.appendChild(infoDiv);
        
        // 按钮容器
        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '10px';
        btnGroup.style.flexDirection = 'column';
        bottomContainer.appendChild(btnGroup);

        // 如果有水印版本，添加切换按钮
        if (resultItem.watermarkedDataUrl) {
            const toggleWatermarkBtn = document.createElement('button');
            toggleWatermarkBtn.className = 'image-download-btn secondary'; // 使用黄色/橙色样式区分
            toggleWatermarkBtn.textContent = '加水印';
            toggleWatermarkBtn.style.marginBottom = '0'; // 覆盖默认样式
            
            toggleWatermarkBtn.addEventListener('click', () => {
                if (isWatermarkShown) {
                    // 切换到无水印
                    img.src = resultItem.processedDataUrl;
                    toggleWatermarkBtn.textContent = '加水印';
                    toggleWatermarkBtn.classList.add('secondary'); // 恢复黄色
                    toggleWatermarkBtn.classList.remove('primary-style'); // 假设有这个样式，或者直接用内联
                    toggleWatermarkBtn.style.backgroundColor = ''; // 恢复默认(secondary css)
                    isWatermarkShown = false;
                } else {
                    // 切换到水印
                    img.src = resultItem.watermarkedDataUrl;
                    toggleWatermarkBtn.textContent = '移除水印';
                    toggleWatermarkBtn.style.backgroundColor = '#909399'; // 灰色表示移除
                    isWatermarkShown = true;
                }
            });
            btnGroup.appendChild(toggleWatermarkBtn);
        }

        // 下载按钮 (下载当前显示的图片)
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'image-download-btn';
        downloadBtn.textContent = '下载图片';
        downloadBtn.addEventListener('click', () => {
            const fileNamePrefix = isWatermarkShown ? '样片-' : '修复版-';
            downloadImage(img.src, fileNamePrefix + resultItem.name);
        });
        btnGroup.appendChild(downloadBtn);
        
        imagePreviewContainer.appendChild(previewItem);
    }

    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function rotateImageDataUrl(dataUrl, degrees) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
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

    async function checkServerStatus() {
        console.log('正在检查服务状态:', `${API_BASE_URL}/health`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            // 检查502错误
            if (typeof check502Error !== 'undefined' && check502Error(response)) {
                return false;
            }
            const body = await response.json().catch(() => ({}));
            if (body.comfyui === false) {
                console.error('ComfyUI 未就绪:', body.comfyui_error || body.message);
                return false;
            }
            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId);
            return false;
        }
    }

    /**
     * 调用后端老照片修复 API
     */
    async function callPhotoRestoreApi(inputImage, enableWatermark, watermarkText) {
        const blob = dataURLtoBlob(inputImage.dataUrl);
        const formData = new FormData();
        formData.append('image', blob, inputImage.name);
        formData.append('enable_watermark', enableWatermark);
        if (enableWatermark) {
            formData.append('watermark_text', watermarkText);
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/photo-restore`, {
                method: 'POST',
                body: formData
            });

            // 检查502错误
            if (typeof check502Error !== 'undefined' && check502Error(response)) {
                throw new Error('Backend service unavailable');
            }

            if (!response.ok) {
                throw new Error(`服务器错误: ${response.status}`);
            }

            const data = await response.json();
            if (data.success && data.image_data) {
                // 返回结果对象
                const result = {
                    name: inputImage.name.replace(/\.[^/.]+$/, "") + ".png",
                    processedDataUrl: data.image_data, // 无水印
                    watermarkedDataUrl: data.watermarked_image_data || null // 有水印
                };
                return result;
            } else {
                throw new Error(data.error || '未知错误');
            }
        } catch (err) {
            console.error("API调用失败", err);
            // 如果是502错误，已经显示弹窗
            if (err.message === 'Backend service unavailable') {
                throw err;
            }
            if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
                throw new Error(getServiceErrorMsg());
            }
            throw err;
        }
    }

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
        imageRotations = {};
        imageSelectionPreview.innerHTML = '';
        imagePreviewContainer.innerHTML = '';
        saveAllBtn.classList.add('hidden');
        if (fileInput) fileInput.value = '';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function saveAllImages() {
        if (processedImages.length === 0) return;

        if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            
            processedImages.forEach(img => {
                // 保存无水印版
                const blob = dataURLtoBlob(img.processedDataUrl);
                zip.file("修复版-" + img.name, blob);
                
                // 保存水印版
                if (img.watermarkedDataUrl) {
                    const blobW = dataURLtoBlob(img.watermarkedDataUrl);
                    zip.file("样片-" + img.name, blobW);
                }
            });
            
            const now = new Date();
            const dateStr = now.toISOString().slice(0,10);
            const zipFilename = `老照片修复_${dateStr}.zip`;
            
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
            alert('打包组件加载失败，将为您逐个下载图片。');
            processedImages.forEach(img => {
                downloadImage(img.processedDataUrl, "修复版-" + img.name);
            });
        }
    }
    
    window.showToast = window.showToast || ((msg) => console.log(msg));
});
