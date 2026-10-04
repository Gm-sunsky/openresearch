from __future__ import annotations

import json
import plistlib
import stat
import struct
import sys
import zipfile
from pathlib import Path


APP_ROOT = "OpenResearch.app/"
MAIN_EXECUTABLE = f"{APP_ROOT}Contents/MacOS/OpenResearch"
INFO_PLIST = f"{APP_ROOT}Contents/Info.plist"
PACKAGE_JSON = f"{APP_ROOT}Contents/Resources/app/package.json"
WASM = f"{APP_ROOT}Contents/Resources/sql-wasm.wasm"
RENDERER = f"{APP_ROOT}Contents/Resources/app/dist/index.html"
MAIN_SCRIPT = f"{APP_ROOT}Contents/Resources/app/dist-electron/electron/main/index.js"
APP_ICON = f"{APP_ROOT}Contents/Resources/app-icon.icns"
RESEARCH_SKILL = f"{APP_ROOT}Contents/Resources/app/research-skills/general-information-research/SKILL.md"
CPU_TYPES = {
    0x0100000C: "arm64",
    0x01000007: "x64",
}


def unix_mode(entry: zipfile.ZipInfo) -> int:
    return (entry.external_attr >> 16) & 0xFFFF


def macho_architecture(data: bytes) -> str:
    if len(data) < 8:
        raise ValueError("main executable is too small to be Mach-O")
    magic_le = struct.unpack("<I", data[:4])[0]
    magic_be = struct.unpack(">I", data[:4])[0]
    if magic_le in {0xFEEDFACE, 0xFEEDFACF}:
        cpu_type = struct.unpack("<I", data[4:8])[0]
    elif magic_be in {0xFEEDFACE, 0xFEEDFACF}:
        cpu_type = struct.unpack(">I", data[4:8])[0]
    else:
        raise ValueError(f"unexpected Mach-O magic: {data[:4].hex()}")
    return CPU_TYPES.get(cpu_type, f"unknown-{cpu_type:#x}")


def verify(archive_path: Path, expected_architecture: str, expected_version: str) -> dict[str, object]:
    with zipfile.ZipFile(archive_path, "r") as archive:
        entries = {entry.filename: entry for entry in archive.infolist()}
        required = [MAIN_EXECUTABLE, INFO_PLIST, PACKAGE_JSON, WASM, RENDERER, MAIN_SCRIPT, APP_ICON, RESEARCH_SKILL]
        missing = [name for name in required if name not in entries]
        if missing:
            raise ValueError(f"missing required entries: {missing}")
        roots = {name.split("/", 1)[0] for name in entries if name}
        if roots != {APP_ROOT.rstrip("/")}:
            raise ValueError(f"unexpected archive roots: {sorted(roots)}")

        executable = entries[MAIN_EXECUTABLE]
        executable_mode = unix_mode(executable)
        if not executable_mode & stat.S_IXUSR:
            raise ValueError(f"main executable lost execute permission: {executable_mode:o}")
        actual_architecture = macho_architecture(archive.read(executable)[:32])
        if actual_architecture != expected_architecture:
            raise ValueError(f"architecture mismatch: expected {expected_architecture}, found {actual_architecture}")

        plist = plistlib.loads(archive.read(INFO_PLIST))
        package = json.loads(archive.read(PACKAGE_JSON))
        if plist.get("CFBundleExecutable") != "OpenResearch":
            raise ValueError("CFBundleExecutable does not match the renamed binary")
        if plist.get("CFBundleIconFile") != "app-icon.icns":
            raise ValueError("CFBundleIconFile does not point to the packaged application icon")
        if plist.get("NSPrincipalClass") != "AtomApplication" or plist.get("NSMainNibFile") != "MainMenu":
            raise ValueError("required Electron application metadata is missing")
        if any(name.startswith(f"{APP_ROOT}Contents/_CodeSignature/") for name in entries):
            raise ValueError("stale outer application signature must not be shipped")
        if plist.get("CFBundleShortVersionString") != expected_version or package.get("version") != expected_version:
            raise ValueError("packaged version does not match")
        skill_text = archive.read(RESEARCH_SKILL).decode("utf-8")
        if "name: general-information-research" not in skill_text or "## Quality gates" not in skill_text:
            raise ValueError("packaged research skill is invalid")

        symlinks = [entry for entry in entries.values() if stat.S_ISLNK(unix_mode(entry))]
        executable_files = [entry for entry in entries.values() if stat.S_ISREG(unix_mode(entry)) and unix_mode(entry) & stat.S_IXUSR]
        if not symlinks:
            raise ValueError("runtime framework symlinks were not preserved")
        if len(executable_files) < 5:
            raise ValueError("runtime helper executable permissions were not preserved")

        return {
            "file": str(archive_path),
            "sizeBytes": archive_path.stat().st_size,
            "entries": len(entries),
            "architecture": actual_architecture,
            "version": expected_version,
            "mainExecutableMode": oct(executable_mode & 0o7777),
            "executableFiles": len(executable_files),
            "symlinks": len(symlinks),
            "wasmBytes": entries[WASM].file_size,
            "researchSkillBytes": entries[RESEARCH_SKILL].file_size,
        }


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: verify-macos-portable.py archive.zip architecture version")
    print(json.dumps(verify(Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=2))
