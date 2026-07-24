document.addEventListener('DOMContentLoaded', function () {
    var patternInput = document.getElementById('pattern-input');
    var flagsInput = document.getElementById('flags-input');
    var testInput = document.getElementById('test-input');
    var testBtn = document.getElementById('test-btn');
    var clearBtn = document.getElementById('clear-btn');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultCount = document.getElementById('result-count');
    var resultMatches = document.getElementById('result-matches');

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg || '';
        errorBox.classList.toggle('show', !!msg);
    }

    function runTest() {
        showError('');
        var pattern = patternInput.value;
        var flags = flagsInput.value.replace(/[^gimsuy]/g, '');
        flagsInput.value = flags;
        if (!pattern) {
            showError(tr('tools.regexTester.needPattern'));
            resultWrap.hidden = true;
            return;
        }
        var text = testInput.value;
        var re;
        try {
            re = new RegExp(pattern, flags);
        } catch (e) {
            showError(tr('tools.regexTester.invalidPattern', { message: e.message }));
            resultWrap.hidden = true;
            return;
        }
        var lines = [];
        var count = 0;
        if (flags.indexOf('g') >= 0) {
            var m;
            while ((m = re.exec(text)) !== null) {
                count++;
                lines.push(formatMatch(m, count));
                if (m[0] === '') re.lastIndex++;
            }
        } else {
            var single = re.exec(text);
            if (single) {
                count = 1;
                lines.push(formatMatch(single, 1));
            }
        }
        resultCount.textContent = String(count);
        resultMatches.textContent = lines.length ? lines.join('\n\n') : tr('tools.regexTester.noMatches');
        resultWrap.hidden = false;
    }

    function formatMatch(m, index) {
        var parts = [tr('tools.regexTester.matchIndex', { n: index })];
        parts.push('  ' + tr('tools.regexTester.matchText') + ': ' + JSON.stringify(m[0]));
        parts.push('  ' + tr('tools.regexTester.matchAt') + ': ' + m.index + '–' + (m.index + m[0].length));
        if (m.length > 1) {
            for (var i = 1; i < m.length; i++) {
                parts.push('  $' + i + ': ' + JSON.stringify(m[i]));
            }
        }
        if (m.groups) {
            Object.keys(m.groups).forEach(function (name) {
                parts.push('  (?<' + name + '>): ' + JSON.stringify(m.groups[name]));
            });
        }
        return parts.join('\n');
    }

    function clearAll() {
        patternInput.value = '';
        flagsInput.value = 'g';
        testInput.value = '';
        showError('');
        resultWrap.hidden = true;
        patternInput.focus();
    }

    testBtn.addEventListener('click', runTest);
    clearBtn.addEventListener('click', clearAll);
});
