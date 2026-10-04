from __future__ import annotations

import plistlib
import shutil
import stat
import sys
import zipfile
from pathlib import Path


APP_NAME = "OpenResearch.app"
RUNTIME_ROOT = "Electron.app/"
APP_ROOT = f"{APP_NAME}/"
PRODUCT_NAME = "OpenResearch"
PRODUCTION_MODULES = (
    "fast-xml-parser",
    "fast-xml-builder",
    "strnum",
    "@nodable",
    "is-unsafe",
    "path-expression-matcher",
    "xml-naming",
    "anynum",
    "sql.js",
)


def cloned_info(source: zipfile.ZipInfo, filename: str) -> zipfile.ZipInfo:
    target = zipfile.ZipInfo(filename, source.date_time)
    target.compress_type = source.compress_type
    target.comment = source.comment
    target.extra = source.extra
    target.create_system = source.create_system
    target.create_version = source.create_version
    target.extract_version = source.extract_version
    target.flag_bits = source.flag_bits
    target.volume = source.volume
    target.internal_attr = source.internal_attr
    target.external_attr = source.external_attr
    return target


def unix_info(filename: str, executable: bool = False, directory: bool = False) -> zipfile.ZipInfo:
    normalized = filename.rstrip("/") + "/" if directory else filename
    info = zipfile.ZipInfo(normalized)
    info.create_system = 3
    mode = stat.S_IFDIR | 0o755 if directory else stat.S_IFREG | (0o755 if executable else 0o644)
    info.external_attr = mode << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    return info


def write_directory_tree(archive: zipfile.ZipFile, source: Path, destination: str) -> None:
    archive.writestr(unix_info(destination, directory=True), b"")
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source).as_posix()
        target = f"{destination.rstrip('/')}/{relative}"
        if path.is_dir():
            archive.writestr(unix_info(target, directory=True), b"")
        else:
            with path.open("rb") as input_file, archive.open(unix_info(target), "w") as output_file:
                shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def write_file(archive: zipfile.ZipFile, source: Path, destination: str) -> None:
    with source.open("rb") as input_file, archive.open(unix_info(destination), "w") as output_file:
        shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def make_plist(runtime_plist: bytes, version: str, architecture: str) -> bytes:
    payload = plistlib.loads(runtime_plist)
    payload.update({
        "CFBundleDisplayName": PRODUCT_NAME,
        "CFBundleExecutable": PRODUCT_NAME,
        "CFBundleIdentifier": "com.airesearchboard.desktop",
        "CFBundleName": PRODUCT_NAME,
        "CFBundleIconFile": "app-icon.icns",
        "CFBundleShortVersionString": version,
        "CFBundleVersion": version,
        "LSApplicationCategoryType": "public.app-category.productivity",
        "AIResearchBoardArchitecture": architecture,
    })
    payload.pop("ElectronAsarIntegrity", None)
    return plistlib.dumps(payload, fmt=plistlib.FMT_XML, sort_keys=False)


def package(runtime_zip: Path, output_zip: Path, project_root: Path, version: str, architecture: str) -> None:
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    info_path = f"{APP_ROOT}Contents/Info.plist"
    default_app_path = f"{APP_ROOT}Contents/Resources/default_app.asar"
    old_executable = f"{APP_ROOT}Contents/MacOS/Electron"
    new_executable = f"{APP_ROOT}Contents/MacOS/{PRODUCT_NAME}"

    with zipfile.ZipFile(runtime_zip, "r") as source, zipfile.ZipFile(
        output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=True
    ) as target:
        runtime_entries = source.infolist()
        if not any(entry.filename == "Electron.app/Contents/MacOS/Electron" for entry in runtime_entries):
            raise RuntimeError("Electron runtime archive does not contain the macOS executable")

        for entry in runtime_entries:
            if not entry.filename.startswith(RUNTIME_ROOT):
                continue
            renamed = APP_ROOT + entry.filename[len(RUNTIME_ROOT) :]
            if renamed in {info_path, default_app_path} or renamed.startswith(f"{APP_ROOT}Contents/_CodeSignature/"):
                continue
            if renamed == old_executable:
                renamed = new_executable
            target.writestr(cloned_info(entry, renamed), source.read(entry))

        target.writestr(unix_info(info_path), make_plist(source.read("Electron.app/Contents/Info.plist"), version, architecture))
        app_resources = f"{APP_ROOT}Contents/Resources/app"
        write_directory_tree(target, project_root / "dist", f"{app_resources}/dist")
        write_directory_tree(target, project_root / "dist-electron", f"{app_resources}/dist-electron")
        write_directory_tree(target, project_root / "research-skills", f"{app_resources}/research-skills")
        write_file(target, project_root / "package.json", f"{app_resources}/package.json")
        target.writestr(unix_info(f"{app_resources}/node_modules", directory=True), b"")
        for module in PRODUCTION_MODULES:
            write_directory_tree(
                target,
                project_root / "node_modules" / Path(module),
                f"{app_resources}/node_modules/{module}",
            )
        write_file(
            target,
            project_root / "node_modules" / "sql.js" / "dist" / "sql-wasm.wasm",
            f"{APP_ROOT}Contents/Resources/sql-wasm.wasm",
        )
        write_file(
            target,
            project_root / "assets" / "brand" / "app-icon.icns",
            f"{APP_ROOT}Contents/Resources/app-icon.icns",
        )


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit("usage: package-macos-portable.py runtime.zip output.zip project version architecture")
    package(
        Path(sys.argv[1]).resolve(),
        Path(sys.argv[2]).resolve(),
        Path(sys.argv[3]).resolve(),
        sys.argv[4],
        sys.argv[5],
    )
