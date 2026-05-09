import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image
from svgpathtools import Line, Path as SvgPath

import ftest2


class TestFtest2Utilities(unittest.TestCase):
    def test_extract_result_url_from_supported_shapes(self):
        self.assertEqual(ftest2._extract_result_url({"data": {"url": "a"}}), "a")
        self.assertEqual(ftest2._extract_result_url({"response": {"url": "b"}}), "b")
        self.assertEqual(ftest2._extract_result_url({"url": "c"}), "c")
        self.assertIsNone(ftest2._extract_result_url({"data": {}, "response": {}}))

    def test_calculate_white_ratio_returns_correct_percentage(self):
        with tempfile.TemporaryDirectory() as td:
            img_path = Path(td) / "ratio.png"
            img = Image.new("L", (2, 2))
            img.putdata([255, 255, 255, 0])
            img.save(img_path)
            self.assertAlmostEqual(ftest2.calculate_white_ratio(img_path), 0.75)

    def test_svg_has_paths_detects_drawables(self):
        with tempfile.TemporaryDirectory() as td:
            with_paths = Path(td) / "with_paths.svg"
            with_paths.write_text('<svg><rect width="10" height="10"/></svg>', encoding="utf-8")
            self.assertTrue(ftest2.svg_has_paths(with_paths))

            without_paths = Path(td) / "without_paths.svg"
            without_paths.write_text("<svg><g></g></svg>", encoding="utf-8")
            self.assertFalse(ftest2.svg_has_paths(without_paths))

    def test_svg_has_paths_handles_malformed_xml_fallback(self):
        with tempfile.TemporaryDirectory() as td:
            malformed = Path(td) / "malformed.svg"
            malformed.write_text("<svg><path d='M0 0L1 1'></svg", encoding="utf-8")
            self.assertTrue(ftest2.svg_has_paths(malformed))

    def test_clean_svg_for_pen_plotter_removes_image_and_sets_pen_styles(self):
        with tempfile.TemporaryDirectory() as td:
            inp = Path(td) / "in.svg"
            out = Path(td) / "out.svg"
            inp.write_text(
                """<svg xmlns="http://www.w3.org/2000/svg">
<image href="a.png" />
<path d="M 0 0 L 10 10" style="fill:red;stroke:blue;stroke-width:9"/>
</svg>""",
                encoding="utf-8",
            )

            ftest2.clean_svg_for_pen_plotter(inp, out)

            root = ET.parse(out).getroot()
            tags = [el.tag.split("}", 1)[-1] for el in root.iter()]
            self.assertNotIn("image", tags)

            path_el = next(el for el in root.iter() if el.tag.endswith("path"))
            self.assertEqual(path_el.get("fill"), "none")
            self.assertEqual(path_el.get("stroke"), ftest2.STROKE_COLOR)
            self.assertEqual(path_el.get("stroke-width"), ftest2.STROKE_WIDTH_PX)
            style = path_el.get("style", "")
            self.assertIn("fill:none", style)
            self.assertIn(f"stroke:{ftest2.STROKE_COLOR}", style)


class TestFtest2Gcode(unittest.TestCase):
    def test_fit_to_machine_rejects_zero_bbox(self):
        vertical_line = SvgPath(Line(0 + 0j, 0 + 10j))
        with self.assertRaises(RuntimeError):
            ftest2.fit_to_machine([vertical_line])

    def test_sample_path_returns_empty_for_zero_length_path(self):
        zero_length = SvgPath(Line(1 + 1j, 1 + 1j))
        self.assertEqual(ftest2.sample_path(zero_length, scale=1.0, dx=0.0, dy=0.0), [])

    def test_build_gcode_generates_core_program_structure(self):
        path = SvgPath(Line(0 + 0j, 10 + 0j), Line(10 + 0j, 10 + 10j))
        gcode = ftest2.build_gcode([path])

        self.assertIn("G90\nG21\n", gcode)
        self.assertIn(ftest2.PEN_UP, gcode)
        self.assertIn(ftest2.PEN_DOWN, gcode)
        self.assertIn("G1 F15000", gcode)
        self.assertTrue(gcode.endswith("G0 X0 Y0\n"))


if __name__ == "__main__":
    unittest.main()
