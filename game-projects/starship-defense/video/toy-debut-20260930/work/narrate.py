"""Synthesize narration and preserve actual service timing for subtitles."""
import asyncio
import json
from pathlib import Path
import edge_tts

HERE=Path(__file__).resolve().parent
AUDIO=HERE/'audio'
AUDIO.mkdir(exist_ok=True)

TEXT='''虫潮来了，这座基地你能守住吗？
这是我用AI辅助做的《虫潮前哨》。
开门出击，机枪扫射，敌人贴近了就甩一颗手雷。
别光顾着追虫子，身后才是要守的基地。
这一波守住了，基地一滴血没掉。
试玩版已经上线B站Toy，点简介里的链接就能玩。
你试完告诉我，哪处操作最别扭？
下一版，我想先把操作体验打磨好。'''

async def main():
    (HERE/'narration.txt').write_text(TEXT,encoding='utf-8')
    events=[]
    communicate=edge_tts.Communicate(TEXT,'zh-CN-YunxiNeural',rate='+5%',boundary='SentenceBoundary')
    with (AUDIO/'narration.mp3').open('wb') as f:
        async for chunk in communicate.stream():
            if chunk['type']=='audio':f.write(chunk['data'])
            elif chunk['type'] in ('SentenceBoundary','WordBoundary'):events.append(chunk)
    (AUDIO/'timings.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'voice':'zh-CN-YunxiNeural','rate':'+5%','events':len(events),'audio_bytes':(AUDIO/'narration.mp3').stat().st_size},ensure_ascii=False))

if __name__=='__main__':asyncio.run(main())
