import io
import tempfile
import unittest
from unittest import mock

import server


class TestProcessImageAPI(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

    def test_process_image_returns_400_when_file_missing(self):
        resp = self.client.post("/api/process", data={})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["error"], "No file part")

    def test_process_image_returns_400_when_filename_empty(self):
        data = {"file": (io.BytesIO(b"abc"), ""), "mode": "1"}
        resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["error"], "No selected file")

    def test_process_image_success_uses_selected_mode(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(server, "UPLOAD_FOLDER", td), mock.patch("server.ftest2.main", return_value=0) as mocked_main:
                data = {"file": (io.BytesIO(b"img"), "ok.png"), "mode": "2"}
                resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")

        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body["success"])
        self.assertIn("Processing complete", body["message"])
        args = mocked_main.call_args[0][0]
        self.assertEqual(args[:2], ["--mode", "2"])
        self.assertTrue(args[2].endswith("ok.png"))

    def test_process_image_invalid_mode_falls_back_to_one(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(server, "UPLOAD_FOLDER", td), mock.patch("server.ftest2.main", return_value=0) as mocked_main:
                data = {"file": (io.BytesIO(b"img"), "invalid_mode.png"), "mode": "bad"}
                resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")

        self.assertEqual(resp.status_code, 200)
        args = mocked_main.call_args[0][0]
        self.assertEqual(args[:2], ["--mode", "1"])

    def test_process_image_returns_500_when_processing_fails(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(server, "UPLOAD_FOLDER", td), mock.patch("server.ftest2.main", return_value=2):
                data = {"file": (io.BytesIO(b"img"), "fail.png"), "mode": "1"}
                resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body["success"])
        self.assertEqual(body["error"], "Processing failed. Check logs.")

    def test_process_image_returns_500_when_processing_raises(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(server, "UPLOAD_FOLDER", td), mock.patch("server.ftest2.main", side_effect=RuntimeError("boom")):
                data = {"file": (io.BytesIO(b"img"), "error.png"), "mode": "1"}
                resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")

        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertFalse(body["success"])
        self.assertEqual(body["error"], "boom")

    def test_process_image_captures_processing_logs(self):
        def fake_main(_argv):
            print("line-1")
            print("line-2")
            return 0

        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(server, "UPLOAD_FOLDER", td), mock.patch("server.ftest2.main", side_effect=fake_main):
                data = {"file": (io.BytesIO(b"img"), "logs.png"), "mode": "1"}
                resp = self.client.post("/api/process", data=data, content_type="multipart/form-data")

        body = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertIn("line-1", body["logs"])
        self.assertIn("line-2", body["logs"])


if __name__ == "__main__":
    unittest.main()
