# 把 public 下的游戏打成单文件托管版（Artifact 发布时会自动包上页面骨架，所以这里不写 doctype/head/body）
import re, sys
PUB = '/home/claude/jk/public/html/game/jackal-stage1-3d/'
out = sys.argv[1]
html = open(PUB + 'index.html', encoding='utf-8').read()
css = open(PUB + 'css/style.css', encoding='utf-8').read()
js = open(PUB + 'js/game.min.js', encoding='utf-8').read().replace('</script', '<\\/script')
body = html[html.index('<body>') + 6: html.index('<script src="js/game.min.js"></script>')]
body = body.replace('data-list-url="../index.html"', 'data-list-url="#"', 1)
assert 'data-list-url="#"' in body
page = ('<title>赤色要塞 3D 重制版</title>\n'
        '<meta name="description" content="FC 赤色要塞第一关的 3D 重制版：驾驶武装吉普救出俘虏、送上直升机，击败 4 辆蓝色坦克。">\n'
        '<style>\n' + css + '\n</style>\n' + body +
        '<script>/* 托管版：没有游戏列表页，移除「返回游戏列表」入口 */document.querySelectorAll(".list-link").forEach(function(a){a.remove();});</script>\n'
        '<script>\n' + js + '\n</script>\n')
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page.encode()))
