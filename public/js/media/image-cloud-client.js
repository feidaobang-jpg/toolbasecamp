/**
 * Shared client for /image/* cloud tools (login + daily quota).
 */
(function (global) {
    'use strict';

    var TOKEN_KEY = 'auth_token';

    function tr(key, params) {
        return typeof global.t === 'function' ? global.t(key, params) : key;
    }

    function apiBase() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
        var host = global.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
        return global.location.origin + '/api';
    }

    function getToken() {
        return global.localStorage.getItem(TOKEN_KEY) || '';
    }

    function loginUrl() {
        var next = (global.location.pathname || '/') + (global.location.search || '');
        return '../auth/login.html?next=' + encodeURIComponent(next);
    }

    function translateDetail(msg, status) {
        if (!msg) {
            if (status === 502 || status === 504) return tr('common.serviceUnavailable');
            return tr('tools.imageCloud.unknownError');
        }
        var text = String(msg || '').trim();
        if (!text) return tr('tools.imageCloud.unknownError');

        var lower = text.toLowerCase();
        if (
            lower.indexOf('aborted') !== -1
            || lower.indexOf('aborterror') !== -1
            || lower.indexOf('signal is aborted') !== -1
            || lower.indexOf('the operation was aborted') !== -1
            || lower.indexOf('the user aborted') !== -1
        ) {
            if (isWeChat()) {
                return tr('tools.imageCloud.requestTimeoutWeChat');
            }
            return tr('tools.imageCloud.requestTimeout');
        }
        if (text.indexOf('Failed to fetch') !== -1) return tr('tools.imageCloud.networkError');
        if (text === 'Bad Gateway' || text === 'Gateway Timeout') {
            return tr('common.serviceUnavailable');
        }
        if (
            text.indexOf('Green net check failed') !== -1
            || text.indexOf('Input data may contain inappropriate content') !== -1
            || text.indexOf('inappropriate content') !== -1
            || text.indexOf('content moderation') !== -1
        ) {
            return tr('tools.imageCloud.contentBlocked');
        }
        if (
            text.indexOf('MiniMax provider balance insufficient') === 0
            || text.indexOf('MiniMax error 1008') === 0
            || /MiniMax.*insufficient balance/i.test(text)
        ) {
            return tr('tools.aiMusic.providerBalance');
        }
        if (text.indexOf('MiniMax rate limited') === 0 || text.indexOf('MiniMax error 1002') === 0) {
            return tr('tools.aiMusic.rateLimited');
        }
        if (
            text.indexOf('MiniMax API key invalid') === 0
            || text.indexOf('MiniMax is not configured') === 0
        ) {
            return tr('tools.aiMusic.notConfigured');
        }
        if (text.indexOf('Insufficient balance') === 0 || text.indexOf('Insufficient AI balance') === 0) {
            return tr('tools.imageCloud.insufficientBalance');
        }
        if (text.indexOf('Plan generation failed') === 0 || text.indexOf('Structuring failed') === 0) {
            return tr('tools.lifePlans.genFailed');
        }
        if (text.indexOf('OCR failed') === 0) return tr('tools.imageCloud.unknownError');
        if (text.indexOf('InvalidParameter') !== -1) return tr('tools.imageCloud.invalidParameter');
        if (text.indexOf('Unexpected token') !== -1 && text.indexOf('InvalidPa') !== -1) {
            return tr('tools.imageCloud.invalidParameter');
        }

        // Exact phrase → i18n key
        var exact = {
            'Authentication required': 'auth.authRequired',
            'Session expired. Please log in again.': 'auth.sessionExpired',
            'Daily limit reached. Please try again tomorrow.': 'tools.imageCloud.dailyLimit',
            'Daily limit reached. Please try again tomorrow or log in for a higher limit.': 'tools.lifePlans.dailyLimitGuest',
            'Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).': 'tools.imageCloud.notConfigured',
            'DashScope is not configured (DASHSCOPE_API_KEY).': 'tools.imageCloud.genServiceMissing',
            'Volcengine Ark is not configured (VOLC_ARK_API_KEY).': 'tools.imageCloud.genServiceMissing',
            'Image edit is not configured (DASHSCOPE_API_KEY or VOLC_ARK_API_KEY).': 'tools.imageCloud.genServiceMissing',
            'Please enter a prompt.': 'tools.textToImage.needPrompt',
            'Please enter a prompt': 'tools.textToImage.needPrompt',
            'Please enter a music prompt for instrumental.': 'tools.aiMusic.needPrompt',
            'Please enter a prompt or lyrics.': 'tools.aiMusic.needPrompt',
            'Please enter lyrics (or enable auto lyrics).': 'tools.aiMusic.needLyrics',
            'MiniMax is not configured (MINIMAX_API_KEY).': 'tools.aiMusic.notConfigured',
            'MiniMax returned no audio data.': 'tools.aiMusic.failed',
            'MiniMax returned empty audio.': 'tools.aiMusic.failed',
            'Music generation timed out': 'tools.aiMusic.failed',
            'Music generation failed': 'tools.aiMusic.failed',
            'MiniMax provider balance insufficient (1008). Top up the MiniMax account at platform.minimaxi.com (even music-*-free still requires a funded MiniMax account).': 'tools.aiMusic.providerBalance',
            'MiniMax rate limited (1002). Please retry later or use music-3.0.': 'tools.aiMusic.rateLimited',
            'MiniMax API key invalid or unauthorized. Check MINIMAX_API_KEY.': 'tools.aiMusic.notConfigured',
            'Fun Music returned no audio URL. Check invite access on Model Studio.': 'tools.aiMusic.failed',
            'Fun Music returned no output.': 'tools.aiMusic.failed',
            'Failed to download generated audio.': 'tools.aiMusic.failed',
            'Music result expired or not found': 'tools.aiMusic.failed',
            'Please enter an edit instruction.': 'tools.instructEdit.needPrompt',
            'Please enter an edit instruction or choose a style preset.': 'tools.instructEdit.needPromptOrPreset',
            'Please enter a motion prompt': 'tools.imageToAnimation.needPrompt',
            'Please upload an image file': 'tools.imageCloud.invalidFile',
            'Empty file': 'tools.imageCloud.invalidFile',
            'Empty image': 'tools.imageCloud.invalidFile',
            'Image is too large (max 8MB)': 'tools.imageCloud.tooLarge',
            'Image is too large for portrait segment (max 5MB)': 'tools.imageCloud.tooLarge',
            'Image content is too large': 'tools.imageCloud.tooLarge',
            'Image decode failed': 'tools.imageCloud.decodeFailed',
            'Unsupported image format': 'tools.imageCloud.unsupportedFormat',
            'Image resolution is too large': 'tools.imageCloud.resolutionTooLarge',
            'Image resolution is too small': 'tools.imageCloud.resolutionTooSmall',
            'No portrait subject detected': 'tools.imageCloud.noSubject',
            'Too many people in the image': 'tools.imageCloud.tooManyPeople',
            'Could not separate subject from background': 'tools.imageCloud.segmentFailed',
            'Portrait cutout timed out': 'tools.imageCloud.segmentTimeout',
            'Portrait cutout service busy': 'tools.imageCloud.segmentBusy',
            'Portrait cutout service unavailable': 'tools.imageCloud.serviceUnavailable',
            'Portrait cutout failed': 'tools.imageCloud.segmentFailed',
            'General cutout failed': 'tools.imageCloud.segmentFailed',
            'Image edit timed out': 'tools.imageCloud.editTimeout',
            'Image generation timed out': 'tools.imageCloud.genTimeout',
            'General cutout is not available (rembg not installed).': 'tools.generalCutout.notAvailable',
            'Tencent Cloud service is not enabled': 'tools.imageCloud.serviceNotEnabled',
            'Tencent Cloud account is in arrears': 'tools.imageCloud.accountArrears',
            'No text detected in image': 'tools.imageCloud.noText',
            'No images': 'tools.imageCloud.noImages',
            'Not Found': 'tools.imageCloud.routeNotFound',
            'DeepSeek is not configured (DEEPSEEK_API_KEY).': 'tools.lifePlans.deepseekMissing',
            'Please fill in the form fields': 'tools.lifePlans.needFields',
            'Invalid plan kind': 'tools.lifePlans.invalidKind',
            'Provide a city or temperature for outfit advice': 'tools.outfitPlan.needTemp',
            'Plan generation failed': 'tools.lifePlans.genFailed',
            'Image edit returned no image. Check model access on DashScope.': 'tools.imageCloud.editNoImage',
            'Image edit returned no image. Check Seedream model access on Volcengine Ark.': 'tools.imageCloud.editNoImage',
            'Image generation returned no image. Check model access on DashScope.': 'tools.imageCloud.genNoImage',
            'Failed to download edited image': 'tools.imageCloud.downloadResultFailed',
            'Failed to download generated image': 'tools.imageCloud.downloadResultFailed',
            'Invalid data-URI image': 'tools.imageCloud.decodeFailed',
            'Wan edit supports at most 4 reference images.': 'tools.instructEdit.tooManyRefs',
            'This model supports at most 3 reference images.': 'tools.instructEdit.tooManyRefsQwen',
            'Seedream supports at most 14 reference images.': 'tools.instructEdit.tooManyRefs',
            'Multi-reference mode needs at least 2 images': 'tools.instructEdit.needMultiRefs'
        };
        if (exact[text]) return tr(exact[text]);

        // Strip wrappers like "Image edit failed: wan2.6-image#1: ..."
        var core = text
            .replace(/^Image edit failed:\s*/i, '')
            .replace(/^Image generation failed:\s*/i, '')
            .trim();
        var segments = core.split(/\s*;\s*/);
        var out = [];
        var seen = {};

        function translateOne(part) {
            var p = String(part || '').trim();
            if (!p) return '';
            p = p.replace(/^[A-Za-z0-9._-]+#\d+:\s*/, '').replace(/^[A-Za-z0-9._-]+:\s*/, '').trim();
            if (exact[p]) return tr(exact[p]);

            var rules = [
                [/MiniMax provider balance insufficient|MiniMax error 1008|MiniMax.*insufficient balance/i, 'tools.aiMusic.providerBalance'],
                [/MiniMax rate limited|MiniMax error 1002/i, 'tools.aiMusic.rateLimited'],
                [/MiniMax API key invalid|MiniMax is not configured/i, 'tools.aiMusic.notConfigured'],
                [/resolution is too small/i, 'tools.imageCloud.resolutionTooSmall'],
                [/resolution is too large/i, 'tools.imageCloud.resolutionTooLarge'],
                [/Image decode failed/i, 'tools.imageCloud.decodeFailed'],
                [/Image is too large/i, 'tools.imageCloud.tooLarge'],
                [/Instruction is too long/i, 'tools.instructEdit.promptTooLong'],
                [/Prompt is too long/i, 'tools.textToImage.promptTooLong'],
                [/Too many images/i, 'tools.instructEdit.tooManyGeneric'],
                [/Unsupported model/i, 'tools.imageCloud.unsupportedModel'],
                [/InvalidParameter/i, 'tools.imageCloud.invalidParameter'],
                [/timed out/i, 'tools.imageCloud.editTimeout'],
                [/returned no image/i, 'tools.imageCloud.editNoImage'],
                [/Failed to download/i, 'tools.imageCloud.downloadResultFailed'],
                [/^Insufficient (AI )?balance/i, 'tools.imageCloud.insufficientBalance'],
                [/Daily limit reached/i, 'tools.imageCloud.dailyLimit'],
                [/DashScope is not configured/i, 'tools.imageCloud.genServiceMissing'],
                [/Volcengine Ark is not configured/i, 'tools.imageCloud.genServiceMissing'],
                [/Image edit is not configured/i, 'tools.imageCloud.genServiceMissing'],
                [/copyright/i, 'tools.instructEdit.copyrightBlocked'],
                [/Please enter an edit instruction/i, 'tools.instructEdit.needPromptOrPreset'],
                [/Please enter a prompt/i, 'tools.textToImage.needPrompt'],
                [/Empty image|Empty file|upload an image/i, 'tools.imageCloud.invalidFile']
            ];
            for (var i = 0; i < rules.length; i++) {
                if (rules[i][0].test(p) || rules[i][0].test(text)) return tr(rules[i][1]);
            }
            // Already Chinese — keep
            if (/[\u4e00-\u9fff]/.test(p)) return p;
            // Remaining English technical text → friendly fallback
            if (/[A-Za-z]{3,}/.test(p)) {
                if (/edit/i.test(text)) return tr('tools.instructEdit.failed');
                if (/generat/i.test(text)) return tr('tools.textToImage.failed');
                return tr('tools.imageCloud.unknownError');
            }
            return p;
        }

        for (var s = 0; s < segments.length; s++) {
            var zh = translateOne(segments[s]);
            if (zh && !seen[zh]) {
                seen[zh] = true;
                out.push(zh);
            }
        }
        if (out.length) return out.join('；');
        return tr('tools.imageCloud.unknownError');
    }

    function detailFromData(data) {
        if (!data || data.detail == null) return '';
        if (typeof data.detail === 'string') return data.detail;
        if (Array.isArray(data.detail)) {
            return data.detail.map(function (x) { return x.msg || JSON.stringify(x); }).join('; ');
        }
        return String(data.detail);
    }

    function authFetch(path, options) {
        options = options || {};
        var headers = Object.assign({}, options.headers || {});
        var token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        options.headers = headers;
        var timeoutMs = options.timeoutMs;
        var timer = null;
        if (timeoutMs && typeof AbortController !== 'undefined' && !options.signal) {
            var controller = new AbortController();
            options.signal = controller.signal;
            timer = setTimeout(function () {
                try { controller.abort(); } catch (e) {}
            }, timeoutMs);
        }

        return fetch(apiBase() + path, options).then(function (res) {
            if (timer) clearTimeout(timer);
            // Only treat opaque gateway HTML 502 as site-wide outage; JSON 502 may be API detail.
            var ct = (res.headers && res.headers.get('content-type')) || '';
            if (res.status === 502 && ct.indexOf('application/json') === -1) {
                if (typeof global.check502Error === 'function') global.check502Error(res);
            }
            return res;
        }).catch(function (err) {
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    function requireLogin(gateEl, appEl) {
        var token = getToken();
        if (!token) {
            if (gateEl) gateEl.hidden = false;
            if (appEl) appEl.hidden = true;
            return Promise.resolve(null);
        }
        return authFetch('/auth/me').then(function (res) {
            if (!res.ok) {
                global.localStorage.removeItem(TOKEN_KEY);
                if (gateEl) gateEl.hidden = false;
                if (appEl) appEl.hidden = true;
                return null;
            }
            if (gateEl) gateEl.hidden = true;
            if (appEl) appEl.hidden = false;
            return res.json();
        }).catch(function () {
            if (gateEl) gateEl.hidden = false;
            if (appEl) appEl.hidden = true;
            return null;
        });
    }

    function apiJson(path, options) {
        return authFetch(path, options).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error(translateDetail(detailFromData(data) || res.statusText, res.status));
                    err.status = res.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        }).catch(function (err) {
            if (err && err.status) throw err;
            var msg = (err && err.message) || String(err || '');
            throw new Error(translateDetail(msg, 0));
        });
    }

    function apiBlob(path, options) {
        return authFetch(path, options).then(function (res) {
            if (!res.ok) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    var err = new Error(translateDetail(detailFromData(data) || res.statusText, res.status));
                    err.status = res.status;
                    throw err;
                });
            }
            return res.blob().then(function (blob) {
                return {
                    blob: blob,
                    remaining: res.headers.get('X-Quota-Remaining'),
                    limit: res.headers.get('X-Quota-Limit')
                };
            });
        });
    }

    function setError(el, msg) {
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('show', !!msg);
    }

    function formatQuotaItem(item) {
        if (!item) return '';
        if (item.unlimited) return tr('tools.imageCloud.quotaUnlimited');
        return tr('tools.imageCloud.quotaLine', {
            used: item.used,
            limit: item.limit,
            remaining: item.remaining
        });
    }

    function formatQuota(quotas, action) {
        var item = (quotas || []).find(function (q) { return q.action === action; });
        return formatQuotaItem(item);
    }

    function walletMarkup(wallet) {
        var m = wallet && wallet.markup != null ? Number(wallet.markup) : 2;
        return Number.isFinite(m) && m > 0 ? m : 2;
    }

    function formatWallet(wallet) {
        if (!wallet) return '';
        if (wallet.unlimited) return tr('tools.imageCloud.balanceUnlimited');
        var bal = wallet.balanceCny != null ? Number(wallet.balanceCny) : 0;
        if (!Number.isFinite(bal)) bal = 0;
        return tr('tools.imageCloud.balanceLine', {
            balance: bal.toFixed(2)
        });
    }

    function b64ToObjectUrl(b64, contentType) {
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: contentType || 'image/png' }));
    }

    function b64ToDataUrl(b64, contentType) {
        return 'data:' + (contentType || 'image/png') + ';base64,' + String(b64 || '');
    }

    /** Prefer data URL in WeChat so long-press save/share works; blob elsewhere. */
    function displayImageSrc(b64, contentType) {
        if (isWeChat()) return b64ToDataUrl(b64, contentType);
        return b64ToObjectUrl(b64, contentType);
    }

    function isWeChat() {
        return /MicroMessenger/i.test(global.navigator.userAgent || '');
    }

    function isMobile() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator.userAgent || '');
    }

    function blobFromSource(blobOrUrl) {
        if (!blobOrUrl) return Promise.reject(new Error('empty'));
        if (typeof Blob !== 'undefined' && blobOrUrl instanceof Blob) {
            return Promise.resolve(blobOrUrl);
        }
        if (typeof blobOrUrl === 'string') {
            return fetch(blobOrUrl).then(function (res) {
                if (!res.ok) throw new Error('fetch failed');
                return res.blob();
            });
        }
        return Promise.reject(new Error('unsupported'));
    }

    /** Fetch image URL and return data: URL (for WeChat long-press save/forward). */
    function urlToDataUrl(url) {
        return blobFromSource(url).then(function (blob) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || '')); };
                reader.onerror = function () { reject(reader.error || new Error('read failed')); };
                reader.readAsDataURL(blob);
            });
        });
    }

    /** 1×1 transparent GIF — avoids WeChat broken-image icon while data URL loads. */
    var TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    /**
     * WeChat: show result images as data: URLs so long-press save/forward works
     * and images appear at once (no progressive top-to-bottom paint).
     */
    function applyWeChatResultImage(img, item, fallbackSrc) {
        if (!img || !item) return;
        var url = item.imageUrl;
        var wrap = (img.parentElement && img.parentElement.classList.contains('instruct-result-img-wrap'))
            ? img.parentElement
            : null;

        function setLoading(on) {
            if (!wrap) return;
            wrap.classList.toggle('is-loading', !!on);
            var box = wrap.querySelector('.instruct-result-loading');
            if (on) {
                if (!box) {
                    box = document.createElement('div');
                    box.className = 'instruct-result-loading';
                    var spin = document.createElement('span');
                    spin.className = 'instruct-result-spinner';
                    spin.setAttribute('aria-hidden', 'true');
                    var tip = document.createElement('p');
                    tip.className = 'instruct-result-loading-text';
                    tip.textContent = tr('tools.imageCloud.loadingGenerated');
                    box.appendChild(spin);
                    box.appendChild(tip);
                    wrap.appendChild(box);
                }
            } else if (box && box.parentNode) {
                box.parentNode.removeChild(box);
            }
        }

        if (!isWeChat() || item.imageBase64 || !url) {
            // When base64 is present, callers must pass a data: URL via displayImageSrc —
            // never leave WeChat on blob: (breaks long-press save/forward).
            img.src = fallbackSrc || (item.imageBase64 ? b64ToDataUrl(item.imageBase64, item.contentType) : '');
            setLoading(false);
            return;
        }
        img.alt = '';
        img.src = TRANSPARENT_PIXEL;
        setLoading(true);
        urlToDataUrl(url).then(function (dataUrl) {
            item._wechatDataUrl = dataUrl;
            img.src = dataUrl;
            setLoading(false);
        }).catch(function () {
            img.src = fallbackSrc || url;
            setLoading(false);
        });
    }

    function closeSavePreview() {
        var el = document.getElementById('tb-img-save-preview');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function openSavePreview(src, message) {
        closeSavePreview();
        var wrap = document.createElement('div');
        wrap.id = 'tb-img-save-preview';
        wrap.className = 'tb-img-save-preview';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var panel = document.createElement('div');
        panel.className = 'tb-img-save-preview-panel';
        var tip = document.createElement('p');
        tip.className = 'tb-img-save-preview-tip';
        tip.textContent = message || tr('tools.imageCloud.longPressSave');
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        // Help WeChat recognize as image for long-press menu
        img.setAttribute('referrerpolicy', 'no-referrer');
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'tb-btn';
        close.textContent = tr('tools.imageCloud.closePreview');
        close.addEventListener('click', closeSavePreview);
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap) closeSavePreview();
        });
        panel.appendChild(tip);
        panel.appendChild(img);
        panel.appendChild(close);
        wrap.appendChild(panel);
        document.body.appendChild(wrap);
    }

    function notifySave(msg, tipEl, errorEl) {
        // Action feedback: modal popup (not embedded tip/error in the form).
        if (typeof global.tbNotify === 'function') {
            global.tbNotify(msg);
            return;
        }
        if (tipEl) {
            tipEl.hidden = false;
            tipEl.textContent = msg;
        }
        if (errorEl) setError(errorEl, msg);
    }

    /**
     * Save / share image with feedback.
     * opts: { tipEl, errorEl, title }
     * Returns Promise<boolean> — true if share/download started.
     */
    function downloadBlob(blobOrUrl, filename, tipElOrOpts) {
        var opts = tipElOrOpts && tipElOrOpts.nodeType ? { tipEl: tipElOrOpts } : (tipElOrOpts || {});
        var tipEl = opts.tipEl;
        var errorEl = opts.errorEl;
        var name = filename || 'image.png';

        return blobFromSource(blobOrUrl).then(function (blob) {
            var dataUrlPromise = new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || '')); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsDataURL(blob);
            });

            // WeChat: no share sheet / no auto preview — tip only; preview is via image click.
            if (isWeChat()) {
                return dataUrlPromise.then(function () {
                    notifySave(tr('tools.imageCloud.wechatSaveTip'), tipEl, errorEl);
                    return false;
                });
            }

            // Phone/tablet only: system share sheet. Desktop Windows also has
            // navigator.share — that opens「共享」instead of saving, so skip it.
            if (
                isMobile()
                && global.navigator.share
                && global.navigator.canShare
                && typeof File !== 'undefined'
            ) {
                try {
                    var file = new File([blob], name, { type: blob.type || 'image/png' });
                    if (global.navigator.canShare({ files: [file] })) {
                        return global.navigator.share({
                            files: [file],
                            title: opts.title || name
                        }).then(function () {
                            if (errorEl) setError(errorEl, '');
                            return true;
                        }).catch(function (err) {
                            if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                                return false;
                            }
                            return dataUrlPromise.then(function (dataUrl) {
                                return fallbackSave(dataUrl, blob, name, tipEl, errorEl);
                            });
                        });
                    }
                } catch (shareErr) { /* fall through */ }
            }

            return dataUrlPromise.then(function (dataUrl) {
                return fallbackSave(dataUrl, blob, name, tipEl, errorEl);
            });
        }).catch(function () {
            var msg = tr('tools.imageCloud.saveFailed');
            notifySave(msg, tipEl, errorEl);
            return false;
        });
    }

    function fallbackSave(dataUrl, blob, name, tipEl, errorEl) {
        if (typeof global.tbTriggerDownload === 'function') {
            var ok = global.tbTriggerDownload(blob, name);
            if (isWeChat()) return false;
            if (isMobile() && /iPhone|iPad|iPod/i.test(global.navigator.userAgent || '')) {
                notifySave(tr('tools.imageCloud.iosSaveTip'), tipEl, errorEl);
                return false;
            }
            if (errorEl) setError(errorEl, '');
            return !!ok;
        }

        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }, 2000);
        if (errorEl) setError(errorEl, '');
        return true;
    }

    /**
     * Publish an existing image blob to the public Images hub.
     * meta: { prompt?, model?, source?, filename? }
     */
    function publishPublicImage(blob, meta) {
        meta = meta || {};
        if (!blob) {
            return Promise.reject(new Error(tr('tools.imageCloud.noImages')));
        }
        var fd = new FormData();
        var ctype = blob.type || 'image/png';
        var ext = ctype.indexOf('jpeg') >= 0 || ctype.indexOf('jpg') >= 0
            ? '.jpg'
            : (ctype.indexOf('webp') >= 0 ? '.webp' : '.png');
        var name = meta.filename || ('ai-image' + ext);
        fd.append('file', blob, name);
        fd.append('prompt', meta.prompt || '');
        fd.append('model', meta.model || '');
        fd.append('source', meta.source || 'manual');
        return apiJson('/image/public/publish', {
            method: 'POST',
            body: fd,
            timeoutMs: 120000
        });
    }

    /** Bind tap-to-preview (long-press save/share works inside the preview). */
    function bindImagePreview(img, src) {
        if (!img) return;
        img.style.cursor = 'pointer';
        img.addEventListener('click', function () {
            openSavePreview(src || img.src, tr('tools.imageCloud.longPressSave'));
        });
    }

    function showWeChatBanner(el) {
        if (!el || !isWeChat()) return;
        el.hidden = false;
        el.textContent = tr('tools.imageCloud.wechatBanner');
    }

    function setBusy(busyEl, textEl, on, msg) {
        if (busyEl) {
            busyEl.hidden = !on;
            busyEl.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        if (textEl && msg != null) textEl.textContent = msg;
    }

    global.TBImageCloud = {
        tr: tr,
        apiBase: apiBase,
        getToken: getToken,
        loginUrl: loginUrl,
        requireLogin: requireLogin,
        apiJson: apiJson,
        apiBlob: apiBlob,
        authFetch: authFetch,
        setError: setError,
        setBusy: setBusy,
        formatQuota: formatQuota,
        formatQuotaItem: formatQuotaItem,
        formatWallet: formatWallet,
        walletMarkup: walletMarkup,
        b64ToObjectUrl: b64ToObjectUrl,
        b64ToDataUrl: b64ToDataUrl,
        displayImageSrc: displayImageSrc,
        isWeChat: isWeChat,
        urlToDataUrl: urlToDataUrl,
        applyWeChatResultImage: applyWeChatResultImage,
        downloadBlob: downloadBlob,
        publishPublicImage: publishPublicImage,
        openSavePreview: openSavePreview,
        bindImagePreview: bindImagePreview,
        showWeChatBanner: showWeChatBanner,
        translateDetail: translateDetail
    };
})(window);
