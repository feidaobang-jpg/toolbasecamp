/** Video to Images — extract frames locally in the browser */

function tr(key, params) {
    return typeof t === 'function' ? t(key, params) : key;
}

// 全局变量
let selectedVideo = null;
let extractedFrames = [];
let selectedFrames = [];
let animationInterval = null;
let currentFrameIndex = 0;
let isPlaying = false;
let zoomedImage = null;

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const videoInput = document.getElementById('video-input');
    const browseBtn = document.getElementById('browse-btn');
    const dropZone = document.querySelector('.drop-zone');
    const videoPreviewSection = document.getElementById('video-preview-section');
    const videoContainer = document.getElementById('video-container');
    const framesContainer = document.getElementById('frames-container');
    const framesPreviewSection = document.getElementById('frames-preview-section');
    const frameCountEl = document.getElementById('frame-count');
    const animationContainer = document.getElementById('animation-container');
    const animationPreviewSection = document.getElementById('animation-preview-section');
    
    // 获取按钮
    const extractFramesBtn = document.getElementById('extract-frames-btn');
    const previewAnimationBtn = document.getElementById('preview-animation-btn');
    const saveSelectedBtn = document.getElementById('save-selected-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const clearBtn = document.getElementById('clear-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const speedControl = document.getElementById('speed-control');
    const speedValue = document.getElementById('speed-value');
    
    // 获取提取设置输入
    const frameIntervalInput = document.getElementById('frame-interval');
    const extractDurationInput = document.getElementById('extract-duration');
    const extractDurationValue = document.getElementById('extract-duration-value');
    const startTimeInput = document.getElementById('start-time');
    const startTimeValue = document.getElementById('start-time-value');
    
    if (browseBtn) {
        browseBtn.addEventListener('click', () => videoInput.click());
    }
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    if (extractFramesBtn) extractFramesBtn.addEventListener('click', extractFrames);
    if (previewAnimationBtn) previewAnimationBtn.addEventListener('click', previewAnimation);
    if (saveSelectedBtn) saveSelectedBtn.addEventListener('click', saveSelectedFrames);
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedFrames);
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (speedControl) speedControl.addEventListener('input', updateSpeed);
    
    // 绑定视频选择事件
    if (videoInput) {
        videoInput.addEventListener('change', handleVideoSelect);
    }
    
    function formatSeconds(sec) {
        const n = Math.round(Number(sec) * 10) / 10;
        return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + 's';
    }

    function syncClipSlidersFromVideo(duration) {
        const dur = Math.max(0.1, Number(duration) || 0.1);
        const maxClip = Math.round(dur * 10) / 10;
        extractDurationInput.min = '0.1';
        extractDurationInput.max = String(maxClip);
        extractDurationInput.step = '0.1';
        extractDurationInput.value = String(maxClip);
        extractDurationValue.textContent = formatSeconds(maxClip);
        startTimeInput.min = '0';
        startTimeInput.max = '0';
        startTimeInput.value = '0';
        startTimeValue.textContent = '0s';
    }

    function refreshStartTimeMax() {
        const videoElement = videoContainer.querySelector('video');
        if (!videoElement || !videoElement.duration) return;
        const duration = videoElement.duration;
        const clip = parseFloat(extractDurationInput.value) || 0.1;
        const maxStartTime = Math.max(0, Math.round((duration - clip) * 10) / 10);
        startTimeInput.max = String(maxStartTime);
        if (parseFloat(startTimeInput.value) > maxStartTime) {
            startTimeInput.value = String(maxStartTime);
            startTimeValue.textContent = formatSeconds(maxStartTime);
        }
    }

    extractDurationInput.addEventListener('input', () => {
        extractDurationValue.textContent = formatSeconds(extractDurationInput.value);
        refreshStartTimeMax();
    });
    
    startTimeInput.addEventListener('input', () => {
        startTimeValue.textContent = formatSeconds(startTimeInput.value);
    });
    
    // 绑定全选按钮事件
    selectAllBtn.addEventListener('click', selectAllFrames);
    
    // 获取差异图片功能相关元素并绑定事件
    const keepDifferentBtn = document.getElementById('keep-different-btn');
    const similarityThreshold = document.getElementById('similarity-threshold');
    const thresholdValue = document.getElementById('threshold-value');
    
    keepDifferentBtn.addEventListener('click', keepDifferentFrames);
    similarityThreshold.addEventListener('input', () => {
        thresholdValue.textContent = similarityThreshold.value + '%';
    });
    
    // 处理拖放事件
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('video/'));
            if (files.length > 0) {
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                videoInput.files = dt.files;
                handleVideoSelect({ target: { files: dt.files } });
            } else {
                showToast(tr('tools.videoToImages.toastDropVideo'));
            }
        });
    }

    /**
     * 处理视频选择
     * @param {Event} e - 事件对象
     */
    function handleVideoSelect(e) {
        const file = e.target.files[0] || (e.dataTransfer && e.dataTransfer.files[0]);

        if (!file || !file.type.startsWith('video/')) {
            showToast(tr('tools.videoToImages.toastChooseVideo'));
            return;
        }

        selectedVideo = file;
        showToast(tr('tools.videoToImages.toastSelectedFile', { name: file.name }));
        
        // 创建视频预览
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(file);
        videoElement.controls = true;
        videoElement.style.width = '100%';
        
        // 片段时长上限 = 原视频时长，默认选满整段
        videoElement.addEventListener('loadedmetadata', () => {
            syncClipSlidersFromVideo(videoElement.duration);
        });
        
        // 清空并添加视频到容器
        videoContainer.innerHTML = '';
        videoContainer.appendChild(videoElement);
        
        videoPreviewSection.classList.remove('hidden');
        if (dropZone) dropZone.classList.add('hidden');
        
        // 重置帧相关内容
        extractedFrames = [];
        selectedFrames = [];
        framesContainer.innerHTML = '';
        framesPreviewSection.classList.add('hidden');
        animationPreviewSection.classList.add('hidden');
    }
    
    /**
     * 提取视频帧
     */
    function extractFrames() {
        if (!selectedVideo) {
            showToast(tr('tools.videoToImages.toastSelectVideoFirst'));
            return;
        }

        const interval = parseInt(frameIntervalInput.value, 10) || 100;
        const extractDuration = parseFloat(extractDurationInput.value) || 3;
        const startTime = parseFloat(startTimeInput.value) || 0;

        if (interval < 100) {
            showToast(tr('tools.videoToImages.toastMinInterval'));
            return;
        }

        showToast(tr('tools.videoToImages.toastExtracting'));
        
        // 创建视频元素用于提取帧
        const video = document.createElement('video');
        video.src = URL.createObjectURL(selectedVideo);
        video.muted = true;
        
        // 清空之前的帧
        extractedFrames = [];
        framesContainer.innerHTML = '';
        
        video.addEventListener('loadedmetadata', function() {
            const videoDuration = video.duration;
            
            // 验证时间参数
            if (startTime >= videoDuration) {
                showToast(tr('tools.videoToImages.toastStartExceeds'));
                return;
            }
            
            const endTime = Math.min(startTime + extractDuration, videoDuration);
            const actualDuration = endTime - startTime;
            const totalFrames = Math.floor(actualDuration * 1000 / interval);
            let framesProcessed = 0;
            
            console.log(`提取参数: 开始=${startTime}秒, 结束=${endTime}秒, 时长=${actualDuration}秒, 预计帧数=${totalFrames}`);
            
            // 创建canvas用于提取帧
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 设置canvas尺寸
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // 提取帧的函数
            function captureFrame(time) {
                video.currentTime = time;
                
                video.addEventListener('seeked', function onSeeked() {
                    // 绘制当前帧到canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    // 将canvas内容转为图片
                    const frameData = canvas.toDataURL('image/jpeg');
                    extractedFrames.push(frameData);
                    
                    // 创建帧预览元素
                    const frameElement = createFrameElement(frameData, extractedFrames.length - 1);
                    framesContainer.appendChild(frameElement);
                    
                    // 移除事件监听器，避免重复触发
                    video.removeEventListener('seeked', onSeeked);
                    
                    framesProcessed++;
                    
                    // 检查是否所有帧都已处理
                    if (framesProcessed < totalFrames) {
                        const nextTime = startTime + (framesProcessed * interval) / 1000;
                        if (nextTime < endTime) {
                            captureFrame(nextTime);
                        } else {
                            finishExtraction();
                        }
                    } else {
                        finishExtraction();
                    }
                }, { once: true });
            }
            
            // 开始提取第一帧
            video.play().then(() => {
                video.pause();
                // 在开始提取前显示帧预览区域
                framesPreviewSection.classList.remove('hidden');
                captureFrame(startTime);
            }).catch(error => {
                showToast(tr('tools.videoToImages.toastPlaybackFailed', { msg: error.message }));
            });

            function finishExtraction() {
                updateFrameCount();
                showToast(tr('tools.videoToImages.toastExtracted', { n: extractedFrames.length }));
                URL.revokeObjectURL(video.src);
            }
        });

        video.addEventListener('error', function() {
            showToast(tr('tools.videoToImages.toastLoadFailed'));
        });
    }

    function createZoomModal(imageSrc, currentIndex) {
        // 如果已存在模态框，先移除
        if (zoomedImage) {
            zoomedImage.remove();
        }
        
        let modalCurrentIndex = currentIndex;
        
        // 创建模态框容器
        const modal = document.createElement('div');
        modal.className = 'zoom-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';
        
        // 创建图片容器
        const imgContainer = document.createElement('div');
        imgContainer.style.position = 'relative';
        imgContainer.style.display = 'flex';
        imgContainer.style.justifyContent = 'center';
        imgContainer.style.alignItems = 'center';
        imgContainer.style.maxWidth = '90%';
        imgContainer.style.maxHeight = '90%';
        
        // 创建图片元素
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.cursor = 'default';
        
        // 检查是否为PNG格式（透明图片）
        if (imageSrc.startsWith('data:image/png')) {
            // 添加透明背景支持
            img.style.backgroundColor = 'transparent';
            // 添加棋盘格背景来显示透明区域
            img.style.backgroundImage = `
                linear-gradient(45deg, #ccc 25%, transparent 25%), 
                linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                linear-gradient(45deg, transparent 75%, #ccc 75%), 
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
            `;
            img.style.backgroundSize = '20px 20px';
            img.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
        }
        
        // 创建图片信息显示
        const imageInfo = document.createElement('div');
        imageInfo.style.position = 'absolute';
        imageInfo.style.bottom = '-40px';
        imageInfo.style.left = '50%';
        imageInfo.style.transform = 'translateX(-50%)';
        imageInfo.style.color = 'white';
        imageInfo.style.fontSize = '16px';
        imageInfo.style.textAlign = 'center';
        imageInfo.textContent = `${modalCurrentIndex + 1} / ${extractedFrames.length}`;
        
        // 添加关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '20px';
        closeBtn.style.right = '30px';
        closeBtn.style.color = 'white';
        closeBtn.style.fontSize = '40px';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.zIndex = '1001';
        
        // 创建上一张按钮
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '‹';
        prevBtn.style.position = 'absolute';
        prevBtn.style.left = '30px';
        prevBtn.style.top = '50%';
        prevBtn.style.transform = 'translateY(-50%)';
        prevBtn.style.color = 'white';
        prevBtn.style.fontSize = '60px';
        prevBtn.style.fontWeight = 'bold';
        prevBtn.style.background = 'rgba(0, 0, 0, 0.5)';
        prevBtn.style.border = 'none';
        prevBtn.style.borderRadius = '50%';
        prevBtn.style.width = '60px';
        prevBtn.style.height = '60px';
        prevBtn.style.cursor = 'pointer';
        prevBtn.style.display = extractedFrames.length > 1 ? 'flex' : 'none';
        prevBtn.style.justifyContent = 'center';
        prevBtn.style.alignItems = 'center';
        prevBtn.style.zIndex = '1001';
        
        // 创建下一张按钮
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '›';
        nextBtn.style.position = 'absolute';
        nextBtn.style.right = '30px';
        nextBtn.style.top = '50%';
        nextBtn.style.transform = 'translateY(-50%)';
        nextBtn.style.color = 'white';
        nextBtn.style.fontSize = '60px';
        nextBtn.style.fontWeight = 'bold';
        nextBtn.style.background = 'rgba(0, 0, 0, 0.5)';
        nextBtn.style.border = 'none';
        nextBtn.style.borderRadius = '50%';
        nextBtn.style.width = '60px';
        nextBtn.style.height = '60px';
        nextBtn.style.cursor = 'pointer';
        nextBtn.style.display = extractedFrames.length > 1 ? 'flex' : 'none';
        nextBtn.style.justifyContent = 'center';
        nextBtn.style.alignItems = 'center';
        nextBtn.style.zIndex = '1001';
        
        // 更新图片的函数
        function updateImage() {
            img.src = extractedFrames[modalCurrentIndex];
            imageInfo.textContent = `${modalCurrentIndex + 1} / ${extractedFrames.length}`;
        }
        
        // 上一张按钮事件
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modalCurrentIndex = (modalCurrentIndex - 1 + extractedFrames.length) % extractedFrames.length;
            updateImage();
        });
        
        // 下一张按钮事件
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modalCurrentIndex = (modalCurrentIndex + 1) % extractedFrames.length;
            updateImage();
        });
        
        // 关闭按钮事件
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modal.remove();
            zoomedImage = null;
        });
        
        // 组装元素
        imgContainer.appendChild(img);
        imgContainer.appendChild(imageInfo);
        modal.appendChild(imgContainer);
        modal.appendChild(closeBtn);
        modal.appendChild(prevBtn);
        modal.appendChild(nextBtn);
        
        // 添加到文档
        document.body.appendChild(modal);
        zoomedImage = modal;
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                zoomedImage = null;
            }
        });
        
        // 阻止图片容器的点击事件冒泡
        imgContainer.addEventListener('click', (e) => e.stopPropagation());
        
        // 添加键盘事件支持
        const handleKeyPress = (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    modalCurrentIndex = (modalCurrentIndex - 1 + extractedFrames.length) % extractedFrames.length;
                    updateImage();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    modalCurrentIndex = (modalCurrentIndex + 1) % extractedFrames.length;
                    updateImage();
                    break;
                case 'Escape':
                    e.preventDefault();
                    modal.remove();
                    zoomedImage = null;
                    document.removeEventListener('keydown', handleKeyPress);
                    break;
            }
        };
        
        // 绑定键盘事件
        document.addEventListener('keydown', handleKeyPress);
        
        // 模态框关闭时移除键盘事件监听
        const originalRemove = modal.remove;
        modal.remove = function() {
            document.removeEventListener('keydown', handleKeyPress);
            originalRemove.call(this);
        };
    }
    
    function createFrameElement(frameData, index) {
        const frameItem = document.createElement('div');
        frameItem.className = 'frame-item';
        
        // 创建图片元素
        const img = document.createElement('img');
        img.src = frameData;
        img.alt = `Frame ${index + 1}`;
        img.style.cursor = 'pointer';
        
        if (frameData.startsWith('data:image/png')) {
            img.classList.add('has-alpha');
        }
        
        // 添加点击放大功能
        img.addEventListener('click', () => {
            // 使用当前extractedFrames数组中的最新数据
            createZoomModal(extractedFrames[index], index);
        });
        
        // 创建帧编号
        const frameNumber = document.createElement('div');
        frameNumber.className = 'frame-number';
        frameNumber.textContent = index + 1;
        
        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'frame-checkbox';
        checkbox.dataset.index = index;
        
        // 绑定复选框事件
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedFrames.push(index);
            } else {
                const pos = selectedFrames.indexOf(index);
                if (pos !== -1) {
                    selectedFrames.splice(pos, 1);
                }
            }
        });
        
        // 组装元素
        frameItem.appendChild(img);
        frameItem.appendChild(frameNumber);
        frameItem.appendChild(checkbox);
        
        return frameItem;
    }
    
    function updateFrameCount() {
        if (frameCountEl) {
            frameCountEl.textContent = String(extractedFrames.length);
        }
    }

    function renderFramesGrid() {
        framesContainer.innerHTML = '';
        selectedFrames = [];
        extractedFrames.forEach((frameData, index) => {
            framesContainer.appendChild(createFrameElement(frameData, index));
        });
        updateFrameCount();
        if (extractedFrames.length === 0) {
            framesPreviewSection.classList.add('hidden');
            animationPreviewSection.classList.add('hidden');
            if (animationInterval) {
                clearInterval(animationInterval);
                animationInterval = null;
            }
            isPlaying = false;
        }
    }

    function deleteSelectedFrames() {
        if (selectedFrames.length === 0) {
            showToast(tr('tools.videoToImages.toastSelectOne'));
            return;
        }
        const removeSet = new Set(selectedFrames);
        const deleted = removeSet.size;
        extractedFrames = extractedFrames.filter((_, i) => !removeSet.has(i));
        renderFramesGrid();
        showToast(tr('tools.videoToImages.toastDeleted', { n: deleted }));
    }

    /**
     * 比较两张图片的相似度
     * @param {string} img1Data - 第一张图片的DataURL
     * @param {string} img2Data - 第二张图片的DataURL
     * @returns {Promise<number>} - 相似度百分比 (0-100)
     */
    function compareImages(img1Data, img2Data) {
        return new Promise((resolve) => {
            // 创建两个画布
            const canvas1 = document.createElement('canvas');
            const canvas2 = document.createElement('canvas');
            const ctx1 = canvas1.getContext('2d');
            const ctx2 = canvas2.getContext('2d');
            
            // 创建两个图片对象
            const img1 = new Image();
            const img2 = new Image();
            
            img1.onload = () => {
                img2.onload = () => {
                    // 确保两张图片大小相同
                    const width = Math.min(img1.width, img2.width, 100); // 缩小尺寸以提高性能
                    const height = Math.min(img1.height, img2.height, 100);
                    
                    canvas1.width = width;
                    canvas1.height = height;
                    canvas2.width = width;
                    canvas2.height = height;
                    
                    // 绘制图片到画布
                    ctx1.drawImage(img1, 0, 0, width, height);
                    ctx2.drawImage(img2, 0, 0, width, height);
                    
                    // 获取像素数据
                    const data1 = ctx1.getImageData(0, 0, width, height).data;
                    const data2 = ctx2.getImageData(0, 0, width, height).data;
                    
                    // 比较像素
                    let totalPixels = width * height;
                    let differentPixels = 0;
                    
                    // 跳过一些像素以提高性能
                    const skip = 2;
                    for (let i = 0; i < data1.length; i += 4 * skip) {
                        // 比较RGB值
                        const diff = Math.abs(data1[i] - data2[i]) +
                                     Math.abs(data1[i+1] - data2[i+1]) +
                                     Math.abs(data1[i+2] - data2[i+2]);
                        
                        // 如果差异超过阈值，则视为不同像素
                        if (diff > 30) { // 可调整的差异阈值
                            differentPixels++;
                        }
                    }
                    
                    // 计算相似度
                    const similarity = Math.round((1 - (differentPixels / (totalPixels / skip))) * 100);
                    resolve(similarity);
                };
                img2.src = img2Data;
            };
            img1.src = img1Data;
        });
    }
    
    /**
     * 勾选相似帧：每组相似帧勾选多余的（保留中间一帧不勾），不自动删除
     */
    function keepDifferentFrames() {
        if (extractedFrames.length === 0) {
            showToast(tr('tools.videoToImages.toastNoFramesCompare'));
            return;
        }

        showToast(tr('tools.videoToImages.toastComparing'));
        
        const threshold = Math.max(80, Math.min(100, parseInt(document.getElementById('similarity-threshold').value) || 90));
        const checkboxes = document.querySelectorAll('.frame-checkbox');
        
        const similarGroups = [];
        let currentGroup = [0];
        
        async function compareFrames() {
            for (let i = 0; i < extractedFrames.length - 1; i++) {
                const similarity = await compareImages(extractedFrames[i], extractedFrames[i + 1]);
                
                if (similarity >= threshold) {
                    currentGroup.push(i + 1);
                } else {
                    similarGroups.push(currentGroup);
                    currentGroup = [i + 1];
                }
            }
            similarGroups.push(currentGroup);
            
            selectedFrames = [];
            checkboxes.forEach((checkbox) => {
                checkbox.checked = false;
            });
            
            let marked = 0;
            similarGroups.forEach((group) => {
                if (group.length < 2) return;
                const keepIndex = group[Math.floor(group.length / 2)];
                group.forEach((frameIndex) => {
                    if (frameIndex === keepIndex) return;
                    const checkbox = checkboxes[frameIndex];
                    if (!checkbox) return;
                    checkbox.checked = true;
                    selectedFrames.push(frameIndex);
                    marked += 1;
                });
            });
            selectedFrames.sort((a, b) => a - b);
            
            showToast(tr('tools.videoToImages.toastSelectedSimilar', { n: marked }));
        }
        
        compareFrames();
    }
    
    /**
     * 预览动画
     */
    function previewAnimation() {
        if (selectedFrames.length === 0) {
            showToast(tr('tools.videoToImages.toastSelectOne'));
            return;
        }

        animationPreviewSection.classList.remove('hidden');
        animationContainer.innerHTML = '';

        const img = document.createElement('img');
        img.src = extractedFrames[selectedFrames[0]];
        animationContainer.appendChild(img);

        currentFrameIndex = 0;
        isPlaying = true;

        if (playPauseBtn) {
            playPauseBtn.textContent = tr('tools.videoToImages.pause');
        }

        startAnimation();
    }
    
    /**
     * 开始帧动画
     */
    function startAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
        }

        const speed = speedControl ? parseInt(speedControl.value, 10) : 5;
        const frameDelay = 1000 / speed;

        animationInterval = setInterval(() => {
            if (!isPlaying) return;

            const frameIndex = selectedFrames[currentFrameIndex];
            const img = animationContainer.querySelector('img');
            if (img && extractedFrames[frameIndex]) {
                img.src = extractedFrames[frameIndex];
            }

            currentFrameIndex = (currentFrameIndex + 1) % selectedFrames.length;
        }, frameDelay);
    }

    function togglePlayPause() {
        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying
            ? tr('tools.videoToImages.pause')
            : tr('tools.videoToImages.play');

        if (isPlaying && !animationInterval) {
            startAnimation();
        }
    }
    
    /**
     * 更新动画速度
     */
    function updateSpeed() {
        const speed = speedControl.value;
        speedValue.textContent = speed;
        
        // 如果动画正在播放，重新启动以应用新速度
        if (isPlaying) {
            startAnimation();
        }
    }
    
    /**
     * 全选所有帧
     */
    function selectAllFrames() {
        if (extractedFrames.length === 0) {
            showToast(tr('tools.videoToImages.toastNoFramesSelect'));
            return;
        }
        
        // 清空已选择的帧
        selectedFrames = [];
        
        // 获取所有复选框并选中
        const checkboxes = document.querySelectorAll('.frame-checkbox');
        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = true;
            selectedFrames.push(parseInt(checkbox.dataset.index));
        });
        
        showToast(tr('tools.videoToImages.toastSelectedAll', { n: selectedFrames.length }));
    }
    
    /**
     * 保存选中的帧
     */
    function saveSelectedFrames() {
        if (selectedFrames.length === 0) {
            showToast(tr('tools.videoToImages.toastSelectOne'));
            return;
        }
        
        try {
            // 创建ZIP并打包下载所有选中的帧
            createAndDownloadZip();
        } catch (error) {
            console.error('保存图片错误:', error);
            showToast(tr('tools.videoToImages.toastSaveFailed', { msg: error.message }));
        }
    }
    
    /**
     * 创建并下载ZIP文件
     */
    function createAndDownloadZip() {
        const zip = new JSZip();
        
        // 添加每张图片到zip
        selectedFrames.forEach((frameIndex, i) => {
            const dataUrl = extractedFrames[frameIndex];
            // 根据数据URL的格式决定文件扩展名
            const isTransparent = dataUrl.startsWith('data:image/png');
            const fileName = `frame_${frameIndex + 1}.${isTransparent ? 'png' : 'jpg'}`;
            
            // 将DataURL转换为Blob
            const blob = dataURLtoBlob(dataUrl);
            zip.file(fileName, blob);
        });
        
        // 生成zip文件并下载
        zip.generateAsync({type: 'blob'}).then(function(content) {
            // 生成格式化的时间戳文件名
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const zipName = `${year}-${month}-${day}_${hour}-${minute}.zip`;
            if (typeof window.tbTriggerDownload === 'function') {
                window.tbTriggerDownload(content, zipName);
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = zipName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            showToast(tr('tools.videoToImages.toastSavedZip', { n: selectedFrames.length }));
        }).catch(function(error) {
            console.error('生成ZIP文件失败:', error);
            showToast(tr('tools.videoToImages.toastSaveFailed', { msg: error.message }));
        });
    }
    
    /**
     * 将Data URL转换为Blob对象
     * @param {string} dataUrl - Data URL字符串
     * @returns {Blob} - Blob对象
     */
    function dataURLtoBlob(dataUrl) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        
        return new Blob([u8arr], {type: mime});
    }
    
    /**
     * 清空所有内容
     */
    function clearAll() {
        // 重置视频
        selectedVideo = null;
        videoContainer.innerHTML = '';
        videoPreviewSection.classList.add('hidden');
        
        // 重置帧
        extractedFrames = [];
        selectedFrames = [];
        framesContainer.innerHTML = '';
        framesPreviewSection.classList.add('hidden');
        if (dropZone) dropZone.classList.remove('hidden');

        // 重置动画
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        animationContainer.innerHTML = '';
        animationPreviewSection.classList.add('hidden');
        isPlaying = false;
        
        // 重置文件输入
        videoInput.value = '';
        
        // 移除放大的图片模态框
        if (zoomedImage) {
            zoomedImage.remove();
            zoomedImage = null;
        }
        
        showToast(tr('tools.videoToImages.toastCleared'));
    }
    
    /**
     * 显示提示信息
     * @param {string} message - 提示消息
     */
    function showToast(message) {
        // 检查是否已存在toast元素
        let toast = document.querySelector('.toast');
        
        // 如果不存在，创建一个新的
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        // 设置消息并显示
        toast.textContent = message;
        toast.classList.add('show');
        
        // 3秒后隐藏
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});