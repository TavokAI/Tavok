#!/usr/bin/env python3
"""Verify tavok-sdk wheel/sdist metadata before PyPI publication."""

from __future__ import annotations

import argparse
import email
import sys
import tarfile
import zipfile
from pathlib import Path


EXPECTED_NAME = "tavok-sdk"
EXPECTED_LICENSE = "AGPL-3.0-or-later"
EXPECTED_CLASSIFIER = (
    "License :: OSI Approved :: GNU Affero General Public License v3 or later "
    "(AGPLv3+)"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", default="sdk/python/dist")
    parser.add_argument("--expected-version", required=True)
    return parser.parse_args()


def read_wheel_metadata(path: Path) -> email.message.Message:
    with zipfile.ZipFile(path) as archive:
        license_names = [
            name
            for name in archive.namelist()
            if name == "LICENSE" or name.endswith(".dist-info/licenses/LICENSE")
        ]
        if not license_names:
            raise AssertionError(f"{path.name}: missing LICENSE file")
        metadata_names = [
            name
            for name in archive.namelist()
            if name.endswith(".dist-info/METADATA")
        ]
        if len(metadata_names) != 1:
            raise AssertionError(f"{path.name}: expected one METADATA file")
        return email.message_from_bytes(archive.read(metadata_names[0]))


def read_sdist_metadata(path: Path) -> email.message.Message:
    with tarfile.open(path, "r:gz") as archive:
        license_members = [
            member for member in archive.getmembers() if member.name.endswith("/LICENSE")
        ]
        if not license_members:
            raise AssertionError(f"{path.name}: missing LICENSE file")
        metadata_members = [
            member
            for member in archive.getmembers()
            if member.name.endswith("/PKG-INFO")
        ]
        if len(metadata_members) != 1:
            raise AssertionError(f"{path.name}: expected one PKG-INFO file")
        extracted = archive.extractfile(metadata_members[0])
        if extracted is None:
            raise AssertionError(f"{path.name}: could not read PKG-INFO")
        return email.message_from_bytes(extracted.read())


def verify_metadata(
    artifact: Path,
    metadata: email.message.Message,
    expected_version: str,
) -> None:
    if metadata.get("Name") != EXPECTED_NAME:
        raise AssertionError(f"{artifact.name}: unexpected Name {metadata.get('Name')!r}")
    if metadata.get("Version") != expected_version:
        raise AssertionError(
            f"{artifact.name}: unexpected Version {metadata.get('Version')!r}"
        )

    license_values = metadata.get_all("License-Expression", []) + metadata.get_all(
        "License", []
    )
    if EXPECTED_LICENSE not in license_values:
        raise AssertionError(
            f"{artifact.name}: missing {EXPECTED_LICENSE} license metadata"
        )

    classifiers = metadata.get_all("Classifier", [])
    if EXPECTED_CLASSIFIER not in classifiers:
        raise AssertionError(f"{artifact.name}: missing AGPL classifier")


def main() -> int:
    args = parse_args()
    dist = Path(args.dist)
    wheels = sorted(dist.glob("*.whl"))
    sdists = sorted(dist.glob("*.tar.gz"))

    if len(wheels) != 1:
        raise AssertionError(f"expected exactly one wheel in {dist}")
    if len(sdists) != 1:
        raise AssertionError(f"expected exactly one sdist in {dist}")

    verify_metadata(
        wheels[0], read_wheel_metadata(wheels[0]), args.expected_version
    )
    verify_metadata(
        sdists[0], read_sdist_metadata(sdists[0]), args.expected_version
    )

    print(
        f"Verified {EXPECTED_NAME} {args.expected_version} package metadata in {dist}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
