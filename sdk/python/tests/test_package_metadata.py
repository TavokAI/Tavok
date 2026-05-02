from __future__ import annotations

import tomllib
from pathlib import Path


def test_pyproject_uses_repository_license_metadata():
    pyproject = tomllib.loads(
        (Path(__file__).parents[1] / "pyproject.toml").read_text()
    )

    assert pyproject["project"]["license"] == "AGPL-3.0-or-later"
    assert (
        "License :: OSI Approved :: GNU Affero General Public License v3 or later (AGPLv3+)"
        in pyproject["project"]["classifiers"]
    )
