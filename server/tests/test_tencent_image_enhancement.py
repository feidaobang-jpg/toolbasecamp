"""Offline migration checks: python -m unittest discover -s server/tests -p test_tencent_image_enhancement.py"""

import base64
import asyncio
import json
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tencent_image as api


def image_bytes(fmt="JPEG"):
    out = BytesIO()
    Image.new("RGB", (80, 100), "white").save(out, format=fmt)
    return out.getvalue()


class EnhancementTests(unittest.TestCase):
    def setUp(self):
        self.jpeg = image_bytes()
        self.client = MagicMock()
        self.client.call.return_value = json.dumps({"Response": {
            "CroppedImage": base64.b64encode(self.jpeg).decode("ascii")
        }})
        self.client_patch = patch.object(api, "_ocr_client", return_value=self.client)
        self.client_patch.start()
        self.addCleanup(self.client_patch.stop)

    def assert_png(self, data):
        with Image.open(BytesIO(data)) as result:
            self.assertEqual(result.format, "PNG")
            self.assertEqual(result.size, (80, 100))
            result.load()

    def test_supported_modes_use_new_action_and_preserve_full_page(self):
        expected = {
            1: (1, 0, 2), 2: (0, 1, -1), 202: (0, 0, 3),
            204: (0, 0, 1), 205: (0, 0, 4), 207: (0, 0, 6),
            208: (0, 0, 2), 302: (0, 0, 5),
        }
        for task, settings in expected.items():
            with self.subTest(task=task):
                self.assert_png(api.image_enhancement(self.jpeg, task))
                action, params = self.client.call.call_args.args
                self.assertEqual(action, "CropEnhanceImageOCR")
                self.assertEqual((params["Crop"], params["Deskew"], params["EnhanceType"]), settings)
                self.assertEqual(params["OnlyPosition"], 0)
                self.assertEqual(params["AdjustOrientation"], 0)
                self.assertEqual(base64.b64decode(params["ImageBase64"]), self.jpeg)
                self.assertNotIn("TaskType", params)
                self.assertNotIn("ReturnImage", params)

    def test_url_only_response_from_new_api(self):
        url = "https://ocr-result.cos.ap-guangzhou.myqcloud.com/result.jpg?sign=test"
        self.client.call.return_value = json.dumps({"Response": {"CroppedImageUrl": url}})
        with patch("requests.get") as get:
            response = get.return_value.__enter__.return_value
            response.status_code = 200
            response.iter_content.return_value = [self.jpeg[:30], self.jpeg[30:]]
            self.assert_png(api.image_enhancement(self.jpeg, 302))
            get.assert_called_once_with(url, timeout=(10, 60), stream=True, allow_redirects=False)

    def test_webp_upload_is_normalized(self):
        self.assert_png(api.image_enhancement(image_bytes("WEBP"), 302))
        raw = base64.b64decode(self.client.call.call_args.args[1]["ImageBase64"])
        with Image.open(BytesIO(raw)) as uploaded:
            self.assertEqual(uploaded.format, "PNG")

    def test_unsupported_modes_fail_before_cloud_call(self):
        for task in (301, 303, 304, 999):
            with self.subTest(task=task), self.assertRaises(HTTPException) as ctx:
                api.image_enhancement(self.jpeg, task)
            self.assertEqual(ctx.exception.status_code, 400)
        self.client.call.assert_not_called()

    def test_bad_input_and_base64_limit_do_not_call_cloud(self):
        with self.assertRaises(HTTPException) as ctx:
            api.image_enhancement(b"not an image", 302)
        self.assertEqual(ctx.exception.status_code, 400)
        with patch.object(api, "_b64", return_value="a" * (10 * 1024 * 1024 + 1)):
            with self.assertRaises(HTTPException) as ctx:
                api.image_enhancement(self.jpeg, 302)
            self.assertEqual(ctx.exception.status_code, 400)
        self.client.call.assert_not_called()

    def test_empty_or_invalid_result_is_502(self):
        for result in ({}, {"CroppedImage": "%%%"}, {"CroppedImage": "bm90YW5pbWFnZQ=="}):
            self.client.call.return_value = json.dumps({"Response": result})
            with self.subTest(result=result), self.assertRaises(HTTPException) as ctx:
                api.image_enhancement(self.jpeg, 302)
            self.assertEqual(ctx.exception.status_code, 502)

    def test_malformed_response_is_502(self):
        for result in ("not json", "{}", '{"Response":null}'):
            self.client.call.return_value = result
            with self.subTest(result=result), self.assertRaises(HTTPException) as ctx:
                api.image_enhancement(self.jpeg, 302)
            self.assertEqual(ctx.exception.status_code, 502)

    def test_cloud_error_still_maps_to_http_error(self):
        self.client.call.side_effect = TencentCloudSDKException("FailedOperation.ImageDecodeFailed", "bad image")
        with self.assertRaises(HTTPException) as ctx:
            api.image_enhancement(self.jpeg, 302)
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertEqual(ctx.exception.detail, "Image decode failed")

    def test_resource_package_error_is_actionable(self):
        self.client.call.side_effect = TencentCloudSDKException("ResourceUnavailable.ResourcePackageRunOut", "账号资源包耗尽。")
        with self.assertRaises(HTTPException) as ctx:
            api.image_enhancement(self.jpeg, 302)
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("恢复额度", ctx.exception.detail)

    def test_result_url_rejects_other_hosts_and_redirects(self):
        for url in ("http://127.0.0.1/a", "https://example.com/a", "https://myqcloud.com.evil.example/a"):
            with self.subTest(url=url), patch("requests.get") as get:
                with self.assertRaises(HTTPException):
                    api._download_enhancement_image(url)
                get.assert_not_called()
        with patch("requests.get") as get:
            get.return_value.__enter__.return_value.status_code = 302
            with self.assertRaises(HTTPException):
                api._download_enhancement_image("https://ocr.cos.ap-guangzhou.myqcloud.com/a")

    def test_result_download_failure_and_size_limit(self):
        import requests
        url = "https://ocr.cos.ap-guangzhou.myqcloud.com/a"
        with patch("requests.get", side_effect=requests.Timeout("signed URL must stay private")):
            with self.assertRaises(HTTPException) as ctx:
                api._download_enhancement_image(url)
            self.assertEqual(ctx.exception.detail, "Enhancement image download failed")
        with patch("requests.get") as get, patch.object(api, "_MAX_ENHANCEMENT_RESULT", 10):
            response = get.return_value.__enter__.return_value
            response.status_code = 200
            response.iter_content.return_value = [b"a" * 11]
            with self.assertRaises(HTTPException) as ctx:
                api._download_enhancement_image(url)
            self.assertEqual(ctx.exception.detail, "Enhancement image is too large")

    def test_enhanced_images_still_export_to_pdf(self):
        png = api.image_enhancement(self.jpeg, 302)
        pdf = api.images_to_pdf_bytes([png, png])
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertIn(b"/Count 2", pdf)

    def test_website_enhance_and_pdf_routes_keep_their_response_contract(self):
        import image_tools as routes

        def upload():
            return UploadFile(BytesIO(self.jpeg), filename="sample.jpg",
                              headers=Headers({"content-type": "image/jpeg"}))

        quota = {"remaining": 9, "limit": 10}
        with patch.object(routes, "_require_tencent"), patch.object(routes, "_consume_quota", return_value=quota):
            response = asyncio.run(routes.api_enhance(file=upload(), task_type=302, user={"id": 1}))
            self.assertEqual(response["contentType"], "image/png")
            self.assertEqual(response["taskType"], 302)
            self.assertEqual(response["quota"], quota)
            self.assert_png(base64.b64decode(response["imageBase64"]))
            pdf = asyncio.run(routes.api_to_pdf_advanced(files=[upload(), upload()], remove_shadow=True, user={"id": 1}))
            self.assertEqual(pdf.media_type, "application/pdf")
            self.assertEqual(pdf.headers["x-quota-remaining"], "9")
            self.assertIn(b"/Count 2", pdf.body)
            for call in self.client.call.call_args_list:
                self.assertEqual(call.args[1]["Crop"], 0)
                self.assertEqual(call.args[1]["Deskew"], 0)
                self.assertEqual(call.args[1]["EnhanceType"], 5)
            self.assertEqual(set(routes.ENHANCE_TASKS), set(api.ENHANCE_MODES))


if __name__ == "__main__":
    unittest.main()
