"""Provider failures must recover without substituting stale or partial quotes."""
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import stock_market as market
import stocks
from datetime import datetime, timedelta
from stock_calendar import CN_TZ


def response(text='{}'):
    result = Mock()
    result.content = text.encode('utf-8')
    return result


def page_data(url, params):
    start = (params['pn'] - 1) * 100
    return {'data': {'total': 3000, 'diff': [
        {'f12': str(600000 + i), 'f14': '测试股票', 'f2': 10, 'f3': 1,
         'f6': 200000000, 'f8': 1, 'f100': '测试行业', 'f124': 1791525600}
        for i in range(start, start + 100)]}}


class MarketAdapterTests(unittest.TestCase):
    def setUp(self):
        market._spot_cache.clear()

    def tearDown(self):
        market._spot_cache.clear()

    def test_provider_specific_referer_and_retry_after_rejection(self):
        rejected = response()
        rejected.raise_for_status.side_effect = requests.HTTPError('567')
        with patch('stock_market.requests.get', side_effect=[rejected, response('{"data":{}}')]) as fetch, patch('stock_market.time.sleep'):
            self.assertEqual(market.get_json('https://np-anotice-stock.eastmoney.com/api/security/ann'), {'data': {}})
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args.kwargs['headers']['Referer'], 'https://data.eastmoney.com/')
        self.assertEqual(market.HEADERS['Referer'], 'https://finance.sina.com.cn/')

    def test_quote_referer_does_not_break_sina(self):
        with patch('stock_market.requests.get', return_value=response()) as fetch:
            market.get_text('https://push2delay.eastmoney.com/api/qt/clist/get')
            self.assertEqual(fetch.call_args.kwargs['headers']['Referer'], 'https://quote.eastmoney.com/center/gridlist.html')
            market.get_text('https://hq.sinajs.cn/list=sh000001')
            self.assertEqual(fetch.call_args.kwargs['headers']['Referer'], 'https://finance.sina.com.cn/')

    def test_connection_retry_is_bounded_and_message_sanitized(self):
        with patch('stock_market.requests.get', side_effect=requests.ConnectionError('private diagnostics')) as fetch, patch('stock_market.time.sleep'):
            with self.assertRaisesRegex(RuntimeError, '东方财富行情接口暂不可用') as raised:
                market.get_text('https://push2.eastmoney.com/api/qt/clist/get')
        self.assertEqual(fetch.call_count, 3)
        self.assertNotIn('private diagnostics', str(raised.exception))

    def test_complete_pagination_recovers_from_failed_host(self):
        def feed(url, params):
            if url == market.SPOT_URLS[0]:
                raise RuntimeError('connection closed')
            self.assertEqual(params['fid'], 'f6')
            self.assertEqual(params['ut'], market.EASTMONEY_UT)
            return page_data(url, params)
        with patch('stock_market.get_json', side_effect=feed):
            rows = market.spot_market()
        self.assertEqual(len(rows), 3000)
        self.assertEqual(len({r['symbol'] for r in rows}), 3000)
        self.assertEqual(rows[0]['timestamp'], 1791525600)
        self.assertEqual(rows[0]['sector'], '测试行业')

    def test_short_cache_preserves_provider_time_and_is_not_mutable(self):
        with patch('stock_market.get_json', side_effect=page_data) as feed, patch('stock_market.time.monotonic', return_value=100):
            rows = market.spot_market()
            rows[0]['timestamp'] = 1
            copied = market.spot_market()
        self.assertEqual(feed.call_count, 30)
        self.assertEqual(copied[0]['timestamp'], 1791525600)

    def test_expired_snapshot_never_masks_both_hosts_failing(self):
        with patch('stock_market.get_json', side_effect=page_data), patch('stock_market.time.monotonic', return_value=100):
            market.spot_market()
        with patch('stock_market.get_json', side_effect=RuntimeError('offline')), patch('stock_market._sina_spot_market', side_effect=RuntimeError('主备接口暂不可用')), patch('stock_market.time.monotonic', return_value=131):
            with self.assertRaisesRegex(RuntimeError, '主备接口暂不可用'):
                market.spot_market()

    def test_missing_pages_are_rejected_and_not_cached(self):
        first = page_data('', {'pn': 1})
        with patch('stock_market.get_json', return_value=first), patch('stock_market._sina_spot_market', side_effect=RuntimeError('分页缺失')):
            with self.assertRaisesRegex(RuntimeError, '分页缺失'):
                market.spot_market()
        self.assertFalse(market._spot_cache)

    def test_empty_provider_page_tries_other_host(self):
        def feed(url, params):
            return {'data': {}} if url == market.SPOT_URLS[0] else page_data(url, params)
        with patch('stock_market.get_json', side_effect=feed):
            self.assertEqual(len(market.spot_market()), 3000)

    def test_sina_fallback_never_uses_catalog_prices_as_live_quotes(self):
        def catalog(url, params):
            start = (params['p']-1)*500
            return {'success': True, 'result': {'currentpage': params['p'], 'nextpage': params['p'] < 6,
                'data': [{'SECURITY_CODE': str(600000+i), 'INDUSTRY': '测试行业', 'NEW_PRICE': 999}
                         for i in range(start, start+500)]}}
        def live(symbols):
            return {s: {'name': '实时股名', 'last': 10, 'prev_close': 8, 'amount': 123,
                        'at': '2026-10-09T14:50:00+08:00'} for s in symbols}
        with patch('stock_market.get_json', side_effect=catalog), patch('stock_market.quotes', side_effect=live):
            rows = market._sina_spot_market()
        self.assertEqual(len(rows), 3000)
        self.assertEqual(rows[0]['price'], 10)
        self.assertEqual(rows[0]['pct'], 25)
        self.assertEqual(rows[0]['name'], '实时股名')
        self.assertEqual(rows[0]['sector'], '测试行业')
        self.assertEqual(rows[0]['timestamp'], 1791528600)

    def test_sina_missing_quotes_fail_closed(self):
        data = [{'SECURITY_CODE': str(600000+i), 'INDUSTRY': '测试行业'} for i in range(3000)]
        payload = {'success': True, 'result': {'currentpage': 1, 'nextpage': False, 'data': data}}
        with patch('stock_market.get_json', return_value=payload), patch('stock_market.quotes', return_value={}):
            with self.assertRaisesRegex(RuntimeError, '覆盖不足'):
                market._sina_spot_market()

    def test_fallback_timestamps_still_must_pass_market_freshness(self):
        now = datetime(2026, 10, 9, 14, 50, tzinfo=CN_TZ)
        rows = [{'pct': 1, 'amount': 100, 'timestamp': (now-timedelta(minutes=4)).timestamp(),
                 'source': '新浪实时行情＋东方财富行业名册'} for _ in range(3000)]
        with self.assertRaisesRegex(RuntimeError, '行情缺失或过期'):
            stocks.market_context(rows, now)
        for row in rows:
            row['timestamp'] = now.timestamp()
        q = {'at': now.isoformat(), 'last': 10, 'prev_close': 10}
        with patch('stock_market.quotes', return_value={'sh000001': q}):
            context = stocks.market_context(rows, now)
        self.assertIn('新浪', context['source'])
        self.assertTrue(context['allow_recommend'])


if __name__ == '__main__':
    unittest.main()
