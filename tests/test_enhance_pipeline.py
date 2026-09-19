"""Exercise pipeline coordination without loading multi-GB model dependencies."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


class PipelineTests(unittest.TestCase):
    def test_small_image_coordinates_and_cleanup(self):
        source = Path(__file__).parents[1] / "server/upscale_service_codeformer.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        names = {"_run_pipeline", "_run_pipeline_clean", "_restore_faces"}
        module = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
        original, enlarged, background = object(), object(), object()
        calls = []

        class Helper:
            def clean_all(self):
                self.cropped_faces = []
                calls.append("clean")

            def read_image(self, image):
                self.input_img = enlarged  # Reproduce the vendored helper's implicit enlargement.

            def get_face_landmarks_5(self, **kwargs):
                self_test.assertIs(self.input_img, original)
                return 1

            def align_warp_face(self):
                pass

            def get_inverse_affine(self, value):
                pass

            def paste_faces_to_input_image(self, upsample_img):
                self_test.assertIs(self.input_img, original)
                return upsample_img

        self_test = self
        helper = Helper()
        upsampler = SimpleNamespace(enhance=lambda image, **kwargs: (background,))
        namespace = {"torch": SimpleNamespace(inference_mode=lambda: lambda fn: fn, cuda=SimpleNamespace(OutOfMemoryError=MemoryError)), "_face_helper": helper,
                     "log": SimpleNamespace(warning=lambda message: None),
                     "_bg_upsampler": upsampler, "_device": "cpu", "SCALE": 4}
        exec(compile(module, str(source), "exec"), namespace)
        result, faces = namespace["_run_pipeline_clean"](original)
        self.assertIs(result, background)
        self.assertEqual(faces, 1)
        self.assertEqual(calls, ["clean", "clean"])
        self.assertIsNone(helper.input_img)
        self.assertIsNone(upsampler.output)
        def exhausted(**kwargs):
            raise MemoryError("face masks exceed available memory")
        helper.paste_faces_to_input_image = exhausted
        result, faces = namespace["_run_pipeline_clean"](original)
        self.assertIs(result, background)
        self.assertEqual(faces, 0, "fallback must not claim that faces were restored")
        self.assertIsNone(helper.input_img)


if __name__ == "__main__":
    unittest.main()
