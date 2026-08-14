"""Tests for extraction, despeckling and print geometry."""

from __future__ import annotations

import numpy as np
import pytest

from inkwell import PRESETS, extract, geometry, guides
from inkwell.cli import _ink, main


class TestExtract:
    def test_paper_becomes_transparent(self, inked):
        """The point of flat-field correction. No grey veil anywhere."""
        alpha = extract(inked).alpha
        corners = [alpha[:40, :40], alpha[:40, -40:], alpha[-40:, :40], alpha[-40:, -40:]]
        assert max(int(c.max()) for c in corners) < 24

    def test_ink_reaches_full_opacity(self, inked):
        assert extract(inked).alpha.max() == 255

    def test_ramp_is_preserved_not_thresholded(self, inked):
        """The whole thesis. A thresholded matte has two values; ink has many.

        Anti-aliased stroke edges produce a spread of partial alphas. If this
        collapses to near-binary, the softness that reads as ink is gone.
        """
        alpha = extract(inked).alpha
        partial = ((alpha > 40) & (alpha < 215)).sum()
        assert partial > 500

    def test_trims_to_content(self, inked):
        """Output is cropped to the mark, not left at source size."""
        result = extract(inked)
        assert result.size[0] < inked.size[0]
        assert result.coverage > 0.01

    def test_invert_handles_light_ink_on_dark(self, inked):
        from PIL import Image

        flipped = Image.fromarray(255 - np.asarray(inked.convert("L"), dtype=np.uint8))
        assert extract(flipped, invert=True).alpha.max() == 255

    def test_blank_page_raises(self):
        from PIL import Image

        with pytest.raises(ValueError, match="No ink found"):
            extract(Image.new("L", (400, 400), 200))


class TestDespeckle:
    def test_finds_a_cliff(self, inked):
        result = extract(inked)
        assert result.cliff >= 5.0

    def test_keeps_exactly_the_real_marks(self, inked):
        """The regression that matters.

        The fixture holds four real marks: a V of two joined strokes, a ring, a
        vertical bar, and a small dot. Plus an edge scuff and sixty specks of
        dust. Cleaning must land on four, which means it dropped every artifact
        AND kept the dot. A size threshold big enough to kill the scuff would
        also kill the dot; only finding the cliff gets both right.
        """
        assert extract(inked, clean=True).components == 4

    def test_cleaning_removes_ink_pixels(self, inked):
        """Compare absolute ink, not coverage.

        Coverage is a fraction, and cleaning also tightens the crop, so the
        fraction rises even as ink is removed. The count is what actually falls.
        """
        dirty = extract(inked, clean=False)
        clean = extract(inked, clean=True)
        assert (clean.alpha > 8).sum() < (dirty.alpha > 8).sum()

    def test_crop_tightens_once_the_edge_scuff_is_gone(self, inked):
        """The scuff sits at x=18, so leaving it in widens the crop."""
        assert extract(inked, clean=True).size[0] < extract(inked, clean=False).size[0]

    def test_oversized_artifact_costs_a_real_mark(self, blot):
        """The documented limit, pinned rather than papered over.

        Scale is the only axis this uses, so when a smudge outweighs the
        smallest real mark the cliff lands in the wrong gap. The failure is
        worse than the artifact merely surviving: the cut falls between the
        stroke and the dot, so the smudge is KEPT and the dot is LOST.

        There is no threshold on this axis that does better. The fix is to crop
        the smudge out before extracting.
        """
        result = extract(blot, clean=True)
        assert result.components == 2  # stroke and smudge, dot gone


class TestCards:
    def test_mpc_business_matches_published_minimum(self):
        """MPC's editor states 672 x 1122 for this product. Ours must agree."""
        assert geometry("mpc-business", 300)["canvas"] == (672, 1122)

    def test_bleed_rounds_down_like_the_vendor(self):
        """1/8in at 300dpi is 37.5px. MPC uses 36. Reproduce, do not recompute."""
        assert geometry("mpc-business", 300)["trim_inset"][0] == 36

    def test_doubling_dpi_doubles_every_rectangle(self):
        at300, at600 = geometry("mpc-tarot", 300), geometry("mpc-tarot", 600)
        for key in ("canvas", "trim", "safe"):
            assert at600[key] == (at300[key][0] * 2, at300[key][1] * 2)

    def test_rectangles_are_concentric(self):
        g = geometry("mpc-poker", 300)
        assert g["canvas"][0] > g["trim"][0] > g["safe"][0]
        assert g["canvas"][1] > g["trim"][1] > g["safe"][1]

    def test_guides_match_canvas_and_are_transparent(self):
        overlay = guides("mpc-business", 300)
        assert overlay.size == geometry("mpc-business", 300)["canvas"]
        assert overlay.mode == "RGBA"
        assert np.asarray(overlay)[..., 3].min() == 0

    def test_unknown_preset_names_the_alternatives(self):
        with pytest.raises(KeyError, match="mpc-tarot"):
            geometry("nope")

    def test_every_preset_resolves(self):
        for key in PRESETS:
            assert geometry(key, 600)["canvas"][0] > 0


class TestCli:
    def test_named_and_hex_inks(self):
        assert _ink("gold") == (201, 162, 74)
        assert _ink("#ff0080") == (255, 0, 128)

    def test_bad_ink_rejected(self):
        import argparse

        with pytest.raises(argparse.ArgumentTypeError):
            _ink("chartreuse")

    def test_extract_writes_requested_inks(self, inked, tmp_path):
        photo = tmp_path / "mark.png"
        inked.save(photo)
        assert main(["extract", str(photo), "-o", str(tmp_path), "-i", "white", "gold"]) == 0
        assert (tmp_path / "mark-white.png").exists()
        assert (tmp_path / "mark-gold.png").exists()

    def test_template_writes_overlay(self, tmp_path):
        out = tmp_path / "guides.png"
        assert main(["template", "mpc-business", "--dpi", "300", "-o", str(out)]) == 0
        assert out.exists()

    def test_presets_lists(self, capsys):
        assert main(["presets"]) == 0
        assert "mpc-business" in capsys.readouterr().out
