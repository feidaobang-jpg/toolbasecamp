document.addEventListener('DOMContentLoaded', function () {
    const amountInput = document.getElementById('amount-input');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const errorBox = document.getElementById('error-box');
    const resultWrap = document.getElementById('result-wrap');
    const resultText = document.getElementById('result-text');

    const MAX_AMOUNT = 999999999999.99;
    let toastTimer = null;

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function getScrollParent(el) {
        let node = el && el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const oy = style.overflowY;
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
                node.scrollHeight > node.clientHeight + 1) {
                return node;
            }
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function scrollRevealBottom(el) {
        requestAnimationFrame(function () {
            setTimeout(function () {
                const scroller = getScrollParent(el || document.body);
                const top = scroller.scrollHeight;
                if (typeof scroller.scrollTo === 'function') {
                    scroller.scrollTo({ top: top, behavior: 'smooth' });
                } else {
                    scroller.scrollTop = top;
                }
            }, 80);
        });
    }

    function showError(msg) {
        errorBox.style.display = 'flex';
        errorBox.textContent = msg;
        scrollRevealBottom(errorBox);
    }

    function hideError() {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }

    function showToast(message) {
        let toast = document.getElementById('rmb-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'rmb-toast';
            toast.className = 'rmb-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 1800);
    }

    /**
     * 金额转人民币大写 — 算法迁移自小程序 pages/convert/rmb/rmb.js
     */
    function numberToChineseCurrency(num) {
        const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
        const units = ['', '拾', '佰', '仟'];
        const bigUnits = ['', '万', '亿'];

        let strNum = num.toFixed(2);
        const parts = strNum.split('.');
        const intPart = parts[0];
        const decPart = parts[1];

        if (num === 0) return '零元整';

        let result = '';
        const intLength = intPart.length;

        const groups = [];
        for (let i = intLength; i > 0; i -= 4) {
            const start = Math.max(0, i - 4);
            groups.unshift(intPart.substring(start, i));
        }

        for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
            const group = groups[groupIdx];
            const bigUnitIdx = groups.length - 1 - groupIdx;
            let groupResult = '';
            let hasNonZero = false;

            for (let i = 0; i < group.length; i++) {
                const digit = parseInt(group[i], 10);
                const unitIdx = group.length - 1 - i;

                if (digit !== 0) {
                    if (!hasNonZero && groupResult.endsWith('零')) {
                        // already has 零
                    } else if (hasNonZero && groupResult && !groupResult.endsWith('零')) {
                        const prevDigit = parseInt(group[i - 1], 10);
                        if (prevDigit === 0) {
                            groupResult += '零';
                        }
                    }

                    groupResult += digits[digit] + units[unitIdx];
                    hasNonZero = true;
                }
            }

            if (hasNonZero) {
                if (result && !result.endsWith('零')) {
                    const prevGroup = groups[groupIdx - 1];
                    if (prevGroup) {
                        const allZero = prevGroup.split('').every(function (d) { return d === '0'; });
                        if (!allZero && parseInt(group, 10) < 1000) {
                            result += '零';
                        }
                    }
                }

                result += groupResult + bigUnits[bigUnitIdx];
            }
        }

        result = result.replace(/零+/g, '零').replace(/零+([万亿])/g, '$1').replace(/零+$/, '');

        if (decPart === '00') {
            result += '元整';
        } else {
            const jiao = parseInt(decPart[0], 10);
            const fen = parseInt(decPart[1], 10);

            result += '元';
            if (jiao !== 0) result += digits[jiao] + '角';
            if (fen !== 0) result += digits[fen] + '分';
        }

        return result;
    }

    function parseAmount(raw) {
        var text = String(raw || '').trim().replace(/,/g, '').replace(/￥|¥|元/g, '');
        if (!text) return { error: 'empty' };
        var value = parseFloat(text);
        if (isNaN(value) || value < 0 || value > MAX_AMOUNT) return { error: 'invalid' };
        if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: 'invalid' };
        return { value: value };
    }

    function doConvert() {
        hideError();
        var parsed = parseAmount(amountInput.value);
        if (parsed.error === 'empty') {
            resultWrap.hidden = true;
            showError(tr('tools.rmbUppercase.needAmount'));
            return;
        }
        if (parsed.error) {
            resultWrap.hidden = true;
            showError(tr('tools.rmbUppercase.invalidAmount'));
            return;
        }

        resultText.textContent = numberToChineseCurrency(parsed.value);
        resultWrap.hidden = false;
        scrollRevealBottom(resultWrap);
    }

    function clearAll() {
        amountInput.value = '';
        resultText.textContent = '';
        resultWrap.hidden = true;
        hideError();
        amountInput.focus();
    }

    async function copyResult() {
        var text = (resultText.textContent || '').trim();
        if (!text) {
            showError(tr('tools.rmbUppercase.nothingToCopy'));
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showToast(tr('tools.rmbUppercase.copyDone'));
        } catch (e) {
            showToast(tr('tools.rmbUppercase.copyFailed'));
        }
    }

    convertBtn.addEventListener('click', doConvert);
    clearBtn.addEventListener('click', clearAll);
    copyBtn.addEventListener('click', copyResult);
    amountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doConvert();
    });
});
