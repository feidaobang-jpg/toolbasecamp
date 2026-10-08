"""Compose Douyin's actual 4:3 and 3:4 cover slots from approved gameplay frames."""
from PIL import Image, ImageDraw, ImageFont
import render_backfill as render


def main():
    titles = {'swarm': ('虫潮围城', '这次，反攻母皇'),
              'jackal': ('赤色要塞 3D', '小吉普，大救援'),
              'cadillacs': ('恐龙快打 3D', '三种视角，打同一关')}
    for episode in render.PLAN['episodes']:
        name = episode['id']
        source = render.ROOT / 'final' / name / 'youtube-zh/gameplay-youtube-final.mp4'
        frame = render.WORK / 'edit/douyin-covers' / (name + '-frame.jpg')
        frame.parent.mkdir(parents=True, exist_ok=True)
        render.ffmpeg(['-ss', '1.8', '-i', source, '-frames:v', '1', '-q:v', '2', frame], name + '-douyin-cover-frame')
        screenshot = Image.open(frame).convert('RGB')
        font = lambda size: ImageFont.truetype(render.FONT, size)
        directory = render.ROOT / 'final' / name / 'douyin-zh'
        headline, hook = titles[name]
        paths = []
        for purpose, width, height in [('horizontal', 1440, 1080), ('portrait', 1080, 1440)]:
            canvas = Image.new('RGB', (width, height), '#101924')
            draw = ImageDraw.Draw(canvas)
            if purpose == 'horizontal':
                canvas.paste(screenshot.resize((1440, 810)), (0, 0))
                draw.text((48, 824), headline, font=font(60), fill='#70edce')
                draw.text((48, 918), hook, font=font(64), fill='#ffffff')
                draw.text((48, 1019), episode['recorded_date'] + ' 开发实录', font=font(28), fill='#b8c8d4')
            else:
                draw.text((55, 60), headline, font=font(72), fill='#70edce')
                draw.text((60, 174), '横屏实机 · 历史开发实录', font=font(32), fill='#b8c8d4')
                canvas.paste(screenshot.resize((1080, 608)), (0, 264))
                draw.text((55, 980), hook, font=font(65), fill='#ffffff')
                draw.text((60, 1240), episode['recorded_date'] + ' 录制', font=font(34), fill='#b8c8d4')
            path = directory / ('cover-' + purpose + ('-4x3.jpg' if purpose == 'horizontal' else '-3x4.jpg'))
            canvas.save(path, quality=95)
            paths.append({'file': '../../../' + path.relative_to(render.ROOT).as_posix(),
                          'width': width, 'height': height, 'purpose': 'douyin_' + purpose,
                          'sha256': render.sha(path), 'source': 'approved gameplay frame; native text layout'})
        manifest_path = render.WORK / 'publish' / (name + '-douyin-zh') / 'publish.json'
        manifest = __import__('json').loads(manifest_path.read_text(encoding='utf-8'))
        manifest['platform_cover_files'] = paths
        manifest['cover_upload_mode'] = 'horizontal_4x3_and_portrait_3x4'
        render.write_json(manifest_path, manifest)
        print(name, 'two actual Douyin cover ratios ready')


if __name__ == '__main__':
    main()
