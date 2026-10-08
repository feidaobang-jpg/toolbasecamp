"""Measure the four distinct final soundtracks without decoding video pictures."""
import concurrent.futures
import json
import subprocess

import render_backfill as render


def measure(path):
    result = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-vn', '-sn',
         '-af', 'loudnorm=I=-15:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'],
        capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
    values, _ = json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])
    if float(values['input_tp']) > 0:
        raise RuntimeError('Final audio exceeds 0 dBTP: ' + str(path))
    return {'file': path.relative_to(render.ROOT).as_posix(),
            'integrated_lufs': values['input_i'], 'true_peak_dbtp': values['input_tp'],
            'loudness_range_lu': values['input_lra'], 'objective_analysis': 'pass',
            'subjective_listening': 'not-run'}


def main():
    paths = sorted(render.ROOT.glob('final/*/youtube-*/gameplay-*-final.mp4'))
    if len(paths) != 4:
        raise RuntimeError('Expected four distinct soundtracks')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(measure, paths))
    render.write_json(render.WORK / 'qa/audio-metrics.json',
                      {'results': results, 'note': '客观响度/峰值检查；不代替人工完整试听。'})
    for result in results:
        print(result, flush=True)


if __name__ == '__main__':
    main()
