/** Video to Images — extract frames locally in the browser */

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
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (speedControl) speedControl.addEventListener('input', updateSpeed);
    
    // 绑定视频选择事件
    if (videoInput) {
        videoInput.addEventListener('change', handleVideoSelect);
    }
    
    // 获取去水印按钮并绑定事件
    const removeWatermarkBtn = document.getElementById('remove-watermark-btn');
    const watermarkRemovalSettings = document.getElementById('watermark-removal-settings');
    const watermarkSize = document.getElementById('watermark-size');
    const watermarkSizeValue = document.getElementById('watermark-size-value');
    const watermarkThreshold = document.getElementById('watermark-threshold');
    const watermarkThresholdValue = document.getElementById('watermark-threshold-value');
    
    removeWatermarkBtn.addEventListener('click', processRemoveWatermark);
    
    // 绑定去水印设置事件
    watermarkSize.addEventListener('input', () => {
        watermarkSizeValue.textContent = watermarkSize.value + '%';
    });
    
    watermarkThreshold.addEventListener('input', () => {
        watermarkThresholdValue.textContent = watermarkThreshold.value;
    });
    
    // 绑定提取设置事件
    extractDurationInput.addEventListener('input', () => {
        extractDurationValue.textContent = extractDurationInput.value + 's';
        
        // 更新开始时间滑块的最大值
        const videoElement = videoContainer.querySelector('video');
        if (videoElement && videoElement.duration) {
            const duration = videoElement.duration;
            const maxStartTime = Math.max(0, duration - parseFloat(extractDurationInput.value));
            startTimeInput.max = maxStartTime.toFixed(1);
            
            // 如果当前开始时间超过了最大值，调整它
            if (parseFloat(startTimeInput.value) > maxStartTime) {
                startTimeInput.value = maxStartTime.toFixed(1);
                startTimeValue.textContent = maxStartTime.toFixed(1) + 's';
            }
        }
    });
    
    startTimeInput.addEventListener('input', () => {
        startTimeValue.textContent = startTimeInput.value + 's';
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
                showToast('Please drop a video file');
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
            showToast('Please choose a valid video file');
            return;
        }

        selectedVideo = file;
        showToast('Selected: ' + file.name);
        
        // 创建视频预览
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(file);
        videoElement.controls = true;
        videoElement.style.width = '100%';
        
        // 当视频元数据加载完成时，更新开始时间滑块的最大值
        videoElement.addEventListener('loadedmetadata', () => {
            const duration = videoElement.duration;
            const maxStartTime = Math.max(0, duration - parseFloat(extractDurationInput.value));
            startTimeInput.max = maxStartTime.toFixed(1);
            startTimeInput.value = 0;
            startTimeValue.textContent = '0s';
            console.log(`视频时长: ${duration.toFixed(1)}秒，最大开始时间: ${maxStartTime.toFixed(1)}秒`);
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
            showToast('Select a video first');
            return;
        }

        const interval = parseInt(frameIntervalInput.value, 10) || 100;
        const extractDuration = parseFloat(extractDurationInput.value) || 3;
        const startTime = parseFloat(startTimeInput.value) || 0;

        if (interval < 100) {
            showToast('Minimum interval is 100 ms');
            return;
        }

        showToast('Extracting frames…');
        
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
                showToast('Start time exceeds video length');
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
                showToast('Video playback failed: ' + error.message);
            });

            function finishExtraction() {
                updateFrameCount();
                showToast('Extracted ' + extractedFrames.length + ' frames');
                URL.revokeObjectURL(video.src);
            }
        });

        video.addEventListener('error', function() {
            showToast('Failed to load video');
        });
    }

    function updateFrameCount() {
        if (frameCountEl) {
            frameCountEl.textContent = String(extractedFrames.length);
        }
    }
    
    /**
     * 创建帧预览元素
     * @param {string} frameData - 帧图片数据URL
     * @param {number} index - 帧索引
     * @returns {HTMLElement} - 帧预览元素
     */
    /**
     * 处理所有已提取的帧，移除水印
     */
    function processRemoveWatermark() {
        if (extractedFrames.length === 0) {
            showToast('No frames to process');
            return;
        }

        showToast('Processing frames…');
        
        // 获取水印位置设置
        const watermarkPosition = document.querySelector('input[name="watermark-position"]:checked').value;
        const watermarkSizePercent = parseInt(watermarkSize.value);
        const threshold = parseInt(watermarkThreshold.value);
        
        console.log(`去水印设置: 位置=${watermarkPosition}, 大小=${watermarkSizePercent}%, 阈值=${threshold}`);
        
        // 测试模式：如果阈值设置为99，则直接填充整个区域为红色用于测试
        const isTestMode = threshold >= 99;
        if (isTestMode) {
            console.log('启用测试模式：将直接填充水印区域为红色');
        }
        
        // 创建临时canvas用于处理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let processedCount = 0;
        
        // 处理每一帧
        extractedFrames.forEach((frameData, index) => {
            const img = new Image();
            img.onload = function() {
                // 设置canvas尺寸
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 绘制图片到canvas
                ctx.drawImage(img, 0, 0);
                
                // 移除水印
                if (isTestMode) {
                    // 测试模式：直接填充区域
                    fillWatermarkRegionForTest(ctx, canvas.width, canvas.height, watermarkPosition, watermarkSizePercent);
                } else {
                    removeWatermark(ctx, canvas.width, canvas.height, watermarkPosition, watermarkSizePercent, threshold);
                }
                
                // 将处理后的图片转为PNG格式（支持透明度）
                const processedFrameData = canvas.toDataURL('image/png');
                extractedFrames[index] = processedFrameData;
                
                // 更新对应的帧预览
                const frameItems = document.querySelectorAll('.frame-item');
                if (frameItems[index]) {
                    const img = frameItems[index].querySelector('img');
                    img.src = processedFrameData;
                }
                
                processedCount++;
                
                // 检查是否所有帧都已处理完成
                if (processedCount === extractedFrames.length) {
                    showToast('Processed ' + extractedFrames.length + ' frames');
                }
            };
            img.src = frameData;
        });
    }

    /**
     * 移除水印算法（包含背景透明化）
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     * @param {number} width - 图像宽度
     * @param {number} height - 图像高度
     * @param {string} position - 水印位置
     * @param {number} sizePercent - 水印区域大小百分比
     * @param {number} threshold - 检测阈值
     */
    function removeWatermark(ctx, width, height, position, sizePercent, threshold) {
        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // 1. 先进行背景透明化处理
        removeBackgroundAndMakeTransparent(data, width, height, threshold);
        
        // 2. 再处理指定的水印区域
        const watermarkRegion = calculateWatermarkRegion(width, height, position, sizePercent);
        detectAndRemoveWatermark(data, width, height, watermarkRegion, threshold);
        
        // 将处理后的数据放回canvas
        ctx.putImageData(imageData, 0, 0);
    }
    
    /**
     * 移除背景并使其透明
     */
    function removeBackgroundAndMakeTransparent(data, width, height, threshold) {
        // 检测背景颜色（从边缘采样）
        const backgroundColors = detectBackgroundColors(data, width, height);
        
        console.log('检测到的背景颜色:', backgroundColors);
        
        let transparentPixels = 0;
        
        // 处理每个像素
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 检查是否为背景像素
            let isBackground = false;
            for (const bgColor of backgroundColors) {
                const distance = Math.sqrt(
                    Math.pow(r - bgColor[0], 2) +
                    Math.pow(g - bgColor[1], 2) +
                    Math.pow(b - bgColor[2], 2)
                );
                
                // 使用阈值判断是否为背景
                if (distance < threshold * 2) {
                    isBackground = true;
                    break;
                }
            }
            
            // 如果是背景像素，设为透明
            if (isBackground) {
                data[i + 3] = 0; // 设为完全透明
                transparentPixels++;
            }
        }
        
        console.log(`背景透明化完成，处理了 ${transparentPixels} 个背景像素`);
    }
    
    /**
     * 检测背景颜色
     */
    function detectBackgroundColors(data, width, height) {
        const colorMap = new Map();
        const margin = Math.max(2, Math.min(width, height) * 0.02);
        
        // 从图像边缘采样背景色
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // 只采样边缘区域
                if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
                    const idx = (y * width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    
                    // 量化颜色以减少噪音
                    const quantizedR = Math.floor(r / 16) * 16;
                    const quantizedG = Math.floor(g / 16) * 16;
                    const quantizedB = Math.floor(b / 16) * 16;
                    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
                    
                    colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
                }
            }
        }
        
        // 找出最常见的颜色作为背景色
        const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3); // 取前3个最常见的颜色
        
        const backgroundColors = sortedColors.map(([colorKey, count]) => {
            const [r, g, b] = colorKey.split(',').map(Number);
            return [r, g, b];
        });
        
        // 如果没有找到明显的背景色，使用四个角落的像素
        if (backgroundColors.length === 0) {
            const corners = [
                [0, 0], [width-1, 0], [0, height-1], [width-1, height-1]
            ];
            
            corners.forEach(([x, y]) => {
                const idx = (y * width + x) * 4;
                backgroundColors.push([data[idx], data[idx+1], data[idx+2]]);
            });
        }
        
        return backgroundColors;
    }
    
    /**
     * 计算水印区域
     */
    function calculateWatermarkRegion(width, height, position, sizePercent) {
        const regionWidth = Math.floor(width * sizePercent / 100);
        const regionHeight = Math.floor(height * sizePercent / 100);
        
        let startX, startY;
        
        switch(position) {
            case 'top-left':
                startX = 0;
                startY = 0;
                break;
            case 'top-right':
                startX = width - regionWidth;
                startY = 0;
                break;
            case 'bottom-left':
                startX = 0;
                startY = height - regionHeight;
                break;
            case 'bottom-right':
                startX = width - regionWidth;
                startY = height - regionHeight;
                break;
            default:
                startX = 0;
                startY = 0;
        }
        
        const region = {
            startX: Math.max(0, startX),
            startY: Math.max(0, startY),
            endX: Math.min(width, startX + regionWidth),
            endY: Math.min(height, startY + regionHeight)
        };
        
        console.log(`水印区域: (${region.startX}, ${region.startY}) 到 (${region.endX}, ${region.endY}), 大小: ${region.endX - region.startX} x ${region.endY - region.startY}`);
        
        return region;
    }
    
    /**
     * 绘制水印区域边框（用于调试）
     */
    function drawWatermarkRegion(ctx, width, height, position, sizePercent) {
        const region = calculateWatermarkRegion(width, height, position, sizePercent);
        const { startX, startY, endX, endY } = region;
        
        // 保存当前绘制状态
        ctx.save();
        
        // 设置绿色边框样式
        ctx.strokeStyle = '#00FF00'; // 绿色
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]); // 虚线效果
        
        // 绘制矩形边框
        ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        
        // 添加半透明绿色填充
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(startX, startY, endX - startX, endY - startY);
        
        // 恢复绘制状态
        ctx.restore();
        
        console.log(`绘制水印区域框: (${startX}, ${startY}) 到 (${endX}, ${endY})`);
    }
    
    /**
     * 测试模式：直接填充水印区域
     */
    function fillWatermarkRegionForTest(ctx, width, height, position, sizePercent) {
        const region = calculateWatermarkRegion(width, height, position, sizePercent);
        const { startX, startY, endX, endY } = region;
        
        // 保存当前绘制状态
        ctx.save();
        
        // 填充红色用于测试
        ctx.fillStyle = '#FF0000'; // 红色
        ctx.fillRect(startX, startY, endX - startX, endY - startY);
        
        // 恢复绘制状态
        ctx.restore();
        
        console.log(`测试模式：填充区域 (${startX}, ${startY}) 到 (${endX}, ${endY}) 为红色`);
    }
    
    /**
     * 检测和移除水印
     */
    function detectAndRemoveWatermark(data, width, height, region, threshold) {
        const { startX, startY, endX, endY } = region;
        
        let processedPixels = 0;
        
        // 直接将整个水印区域设为完全透明
        console.log(`开始处理水印区域，将范围内所有像素设为透明`);
        
        // 处理水印区域内的每个像素
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const pixelIdx = (y * width + x) * 4;
                
                // 直接设为完全透明
                data[pixelIdx + 3] = 0; // Alpha通道设为0（完全透明）
                processedPixels++;
            }
        }
        
        console.log(`处理了 ${processedPixels} 个像素，全部设为透明，总区域像素: ${(endX - startX) * (endY - startY)}`);
    }
    
    /**
     * 简化的像素替换判断
     */
    function shouldReplacePixel(data, pixelIdx, avgRef, referenceColors, threshold) {
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        
        // 计算与平均参考颜色的距离
        const avgDistance = Math.sqrt(
            Math.pow(r - avgRef.r, 2) +
            Math.pow(g - avgRef.g, 2) +
            Math.pow(b - avgRef.b, 2)
        );
        
        // 如果差异大于阈值，认为是水印
        return avgDistance > threshold;
    }
    
    /**
     * 计算平均颜色
     */
    function calculateAverageColor(colors) {
        let totalR = 0, totalG = 0, totalB = 0;
        
        for (const color of colors) {
            totalR += color[0];
            totalG += color[1];
            totalB += color[2];
        }
        
        return {
            r: Math.round(totalR / colors.length),
            g: Math.round(totalG / colors.length),
            b: Math.round(totalB / colors.length)
        };
    }
    
    /**
     * 收集参考颜色
     */
    function collectReferenceColors(data, width, height, region) {
        const colors = [];
        const { startX, startY, endX, endY } = region;
        
        // 从水印区域周围采样
        const borderSize = 10; // 边界采样宽度
        
        // 上边界
        for (let x = Math.max(0, startX - borderSize); x < Math.min(width, endX + borderSize); x++) {
            for (let y = Math.max(0, startY - borderSize); y < startY; y++) {
                const idx = (y * width + x) * 4;
                colors.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        }
        
        // 下边界
        for (let x = Math.max(0, startX - borderSize); x < Math.min(width, endX + borderSize); x++) {
            for (let y = endY; y < Math.min(height, endY + borderSize); y++) {
                const idx = (y * width + x) * 4;
                colors.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        }
        
        // 左边界
        for (let x = Math.max(0, startX - borderSize); x < startX; x++) {
            for (let y = startY; y < endY; y++) {
                const idx = (y * width + x) * 4;
                colors.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        }
        
        // 右边界
        for (let x = endX; x < Math.min(width, endX + borderSize); x++) {
            for (let y = startY; y < endY; y++) {
                const idx = (y * width + x) * 4;
                colors.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        }
        
        // 如果采样不够，从更远的地方补充
        if (colors.length < 20) {
            for (let i = 0; i < 30; i++) {
                let x, y;
                do {
                    x = Math.floor(Math.random() * width);
                    y = Math.floor(Math.random() * height);
                } while (x >= startX && x < endX && y >= startY && y < endY);
                
                const idx = (y * width + x) * 4;
                colors.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        }
        
        console.log(`收集了 ${colors.length} 个参考颜色样本`);
        return colors;
    }
    
    /**
     * 改进的水印像素检测
     */
    function isWatermarkPixelImproved(r, g, b, avgRef, referenceColors, threshold) {
        // 计算与平均参考颜色的距离
        const avgDistance = Math.sqrt(
            Math.pow(r - avgRef.r, 2) +
            Math.pow(g - avgRef.g, 2) +
            Math.pow(b - avgRef.b, 2)
        );
        
        // 如果与平均颜色差异很大，可能是水印
        if (avgDistance > threshold * 2) {
            return true;
        }
        
        // 检查与参考颜色的最小距离
        let minDistance = Infinity;
        for (const refColor of referenceColors) {
            const distance = Math.sqrt(
                Math.pow(r - refColor[0], 2) +
                Math.pow(g - refColor[1], 2) +
                Math.pow(b - refColor[2], 2)
            );
            minDistance = Math.min(minDistance, distance);
        }
        
        // 如果与所有参考颜色差异都很大，可能是水印
        return minDistance > threshold;
    }
    
    /**
     * 改进的像素修复
     */
    function repairPixelImproved(data, width, height, x, y, region, avgRef) {
        const { startX, startY, endX, endY } = region;
        
        // 优先使用水印区域外的相邻像素
        const candidates = [];
        const radius = 5;
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    // 如果像素在水印区域外，优先使用
                    if (nx < startX || nx >= endX || ny < startY || ny >= endY) {
                        const idx = (ny * width + nx) * 4;
                        candidates.push({
                            r: data[idx],
                            g: data[idx + 1],
                            b: data[idx + 2],
                            weight: 1.0 / (Math.abs(dx) + Math.abs(dy) + 1) // 距离越近权重越大
                        });
                    }
                }
            }
        }
        
        if (candidates.length > 0) {
            // 使用加权平均
            let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;
            
            for (const candidate of candidates) {
                totalR += candidate.r * candidate.weight;
                totalG += candidate.g * candidate.weight;
                totalB += candidate.b * candidate.weight;
                totalWeight += candidate.weight;
            }
            
            return {
                r: Math.round(totalR / totalWeight),
                g: Math.round(totalG / totalWeight),
                b: Math.round(totalB / totalWeight)
            };
        } else {
            // 如果没有找到区域外的像素，使用平均参考颜色
            return avgRef;
        }
    }
    
    /**
     * 创建放大查看的模态框
     * @param {string} imageSrc - 图片源
     * @param {number} currentIndex - 当前图片索引
     */
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
     * 仅保留差异图片
     */
    function keepDifferentFrames() {
        if (extractedFrames.length === 0) {
            showToast('No frames to compare');
            return;
        }

        showToast('Comparing frames…');
        
        // 获取阈值
        const threshold = Math.max(80, Math.min(100, parseInt(document.getElementById('similarity-threshold').value) || 90));
        
        // 获取所有帧元素
        const frameItems = document.querySelectorAll('.frame-item');
        const checkboxes = document.querySelectorAll('.frame-checkbox');
        
        // 重置所有选择
        selectedFrames = [];
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // 递归比较帧
        const similarGroups = [];
        let currentGroup = [0];
        
        // 比较相邻帧
        async function compareFrames() {
            for (let i = 0; i < extractedFrames.length - 1; i++) {
                const similarity = await compareImages(extractedFrames[i], extractedFrames[i+1]);
                
                if (similarity >= threshold) {
                    currentGroup.push(i+1);
                } else {
                    if (currentGroup.length > 1) {
                        similarGroups.push(currentGroup);
                    } else if (currentGroup.length === 1) {
                        // 单帧，直接选择
                        selectedFrames.push(currentGroup[0]);
                        checkboxes[currentGroup[0]].checked = true;
                    }
                    currentGroup = [i+1];
                }
            }
            
            // 处理最后一组
            if (currentGroup.length > 1) {
                similarGroups.push(currentGroup);
            } else if (currentGroup.length === 1) {
                selectedFrames.push(currentGroup[0]);
                checkboxes[currentGroup[0]].checked = true;
            }
            
            // 处理相似组
            similarGroups.forEach(group => {
                // 选择中间的一帧
                const middleIndex = Math.floor(group.length / 2);
                const selectedIndex = group[middleIndex];
                selectedFrames.push(selectedIndex);
                checkboxes[selectedIndex].checked = true;
            });
            
            // 更新选择数组（排序）
            selectedFrames.sort((a, b) => a - b);
            
            showToast('Kept ' + selectedFrames.length + ' distinct frames');
        }
        
        compareFrames();
    }
    
    /**
     * 预览动画
     */
    function previewAnimation() {
        if (selectedFrames.length === 0) {
            showToast('Select at least one frame');
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
            playPauseBtn.textContent = 'Pause';
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
        playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';

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
            showToast('No frames to select');
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
        
        showToast('Selected all ' + selectedFrames.length + ' frames');
    }
    
    /**
     * 保存选中的帧
     */
    function saveSelectedFrames() {
        if (selectedFrames.length === 0) {
            showToast('Select at least one frame');
            return;
        }
        
        try {
            // 创建ZIP并打包下载所有选中的帧
            createAndDownloadZip();
        } catch (error) {
            console.error('保存图片错误:', error);
            showToast('Save failed: ' + error.message);
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
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = zipName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Saved ' + selectedFrames.length + ' frames as ZIP');
        }).catch(function(error) {
            console.error('生成ZIP文件失败:', error);
            showToast('Save failed: ' + error.message);
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
        
        if (watermarkRemovalSettings) {
            watermarkRemovalSettings.open = false;
        }
        
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
        
        showToast('Cleared');
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