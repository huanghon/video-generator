#!/usr/bin/env python3
"""
Seedance 2.0 Video Generator – Loova img2vid script.
Loads LOOVA_API_KEY from environment or .env file.
Usage: python scripts/run_seedance.py --prompt "prompt" [--model ...] [--duration 5] [--ratio "16:9"] [--files "path1.jpg,path2.jpg"]
Sends request as multipart/form-data: params as JSON field, media as File parts (images/video/audio).
"""
import argparse
import json
import mimetypes
import os
import sys
import time
from typing import Any, List, Optional, Tuple

from dotenv import load_dotenv
import requests

# Load .env from current directory or project root
load_dotenv()

# Read base URL from .env, fallback to standard api.loova.ai
BASE_URL = os.environ.get("VIDEO_PROVIDER_BASE_URL", "https://api.loova.ai/api").rstrip("/")
# For backward compatibility, if base url is loovaai-api, it maps correctly to the sub-routes
if "loovaai-api" in BASE_URL:
    IMG2VID_URL = f"{BASE_URL}/v1/video/seedance-2"
    VIDEO_ITEM_URL = f"{BASE_URL}/v1/tasks"
else:
    IMG2VID_URL = f"{BASE_URL}/v1/video/seedance-2"
    VIDEO_ITEM_URL = f"{BASE_URL}/tasks"

POLL_INTERVAL_SEC = 120
MAX_POLL_COUNT = 50  # ~3 hours at 120s interval (generation can take up to 3 hours)

# Limits per function mode (omni_reference)
OMNI_MAX_IMAGES = 9
OMNI_MAX_VIDEOS = 3
OMNI_MAX_AUDIO = 3
# first_last_frames: at least 1 image
FIRST_LAST_MIN_IMAGES = 1


def _media_type(path: str) -> str:
    """Return 'image', 'video', 'audio', or 'other' from file path (MIME)."""
    mime, _ = mimetypes.guess_type(path)
    if not mime:
        return "other"
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    return "other"


def validate_files_by_function_mode(paths: List[str], function_mode: Optional[str]) -> None:
    """
    Validate file counts by function mode.
    - omni_reference: images <= 9, videos <= 3, audio <= 3.
    - first_last_frames: at least 1 image.
    """
    if not paths:
        if function_mode == "first_last_frames":
            raise ValueError(
                f"function-mode first_last_frames requires at least {FIRST_LAST_MIN_IMAGES} image file(s)."
            )
        return
    by_type: dict[str, List[str]] = {"image": [], "video": [], "audio": [], "other": []}
    for p in paths:
        p = p.strip()
        if not p:
            continue
        t = _media_type(p)
        by_type[t].append(p)
    images, videos, audios = by_type["image"], by_type["video"], by_type["audio"]

    if function_mode == "first_last_frames":
        if len(images) < FIRST_LAST_MIN_IMAGES:
            raise ValueError(
                f"function-mode first_last_frames requires at least {FIRST_LAST_MIN_IMAGES} image file(s), got {len(images)}."
            )
        return
    if function_mode == "omni_reference":
        if len(images) > OMNI_MAX_IMAGES:
            raise ValueError(
                f"function-mode omni_reference allows at most {OMNI_MAX_IMAGES} image(s), got {len(images)}."
            )
        if len(videos) > OMNI_MAX_VIDEOS:
            raise ValueError(
                f"function-mode omni_reference allows at most {OMNI_MAX_VIDEOS} video(s), got {len(videos)}."
            )
        if len(audios) > OMNI_MAX_AUDIO:
            raise ValueError(
                f"function-mode omni_reference allows at most {OMNI_MAX_AUDIO} audio file(s), got {len(audios)}."
            )


def open_files_for_upload(paths: List[str]) -> List[Tuple[str, Tuple[str, Any, str]]]:
    """Open local files and return list of (form_key, (filename, fileobj, content_type)) for multipart upload."""
    result = []
    for path in paths:
        path = path.strip()
        if not path:
            continue
        if not os.path.isfile(path):
            raise FileNotFoundError(f"File not found: {path}")
        f = open(path, "rb")
        name = os.path.basename(path)
        mime, _ = mimetypes.guess_type(path)
        mime = mime or "application/octet-stream"
        result.append(("files", (name, f, mime)))
    return result


def get_api_key() -> str:
    key = os.environ.get("LOOVA_API_KEY", "").strip()
    if not key:
        print(
            "Error: Set LOOVA_API_KEY in .env or environment (obtain it after logging in at https://loova.ai/)",
            file=sys.stderr,
        )
        sys.exit(1)
    return key


def submit_task(api_key: str, args: argparse.Namespace) -> str:
    params = {
        "prompt": args.prompt,
        "ratio": args.ratio,
        "duration": args.duration,
    }
    if args.function_mode:
        params["functionMode"] = args.function_mode

    data = {
        "model": args.model,
        "params": json.dumps(params),
    }
    file_tuples = open_files_for_upload(args.files) if args.files else []
    try:
        resp = requests.post(
            IMG2VID_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files=file_tuples,
            timeout=120,
        )
    finally:
        for _key, (_, f, _) in file_tuples:
            f.close()
    resp.raise_for_status()
    result_data = resp.json()
    task_id = result_data.get("task_id") or (result_data.get("data") or {}).get("task_id") or result_data.get("taskId")
    if not task_id:
        raise RuntimeError("No task_id in response: " + json.dumps(result_data))
    return task_id


def poll_result(api_key: str, task_id: str) -> dict:
    url = f"{VIDEO_ITEM_URL}?task_id={task_id}"
    for i in range(MAX_POLL_COUNT):
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status") or (data.get("data") or {}).get("status") or data.get("state")
        if status in ("succeeded", "success", "completed"):
            return data
        if status in ("failed", "error"):
            msg = data.get("message") or data.get("error") or json.dumps(data)
            raise RuntimeError("Task failed: " + str(msg))
        if i == 0:
            print(
                "Task submitted. Video generation may take up to 3 hours; polling until complete...",
                file=sys.stderr,
            )
        time.sleep(POLL_INTERVAL_SEC)
    raise RuntimeError("Polling timed out (max wait ~3 hours)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seedance 2.0 Video Generator")
    parser.add_argument("--prompt", required=True, help="Prompt text")
    parser.add_argument("--model", default="seedance_2_0", help="Model name")
    parser.add_argument("--duration", type=int, default=5, help="Duration in seconds (4-15)")
    parser.add_argument("--ratio", default="16:9", help="Aspect ratio")
    parser.add_argument("--function-mode", help="first_last_frames or omni_reference")
    parser.add_argument("--files", help="Comma-separated local file paths (sent as multipart File uploads: images/video/audio)")
    args = parser.parse_args()
    args.files = [p.strip() for p in args.files.split(",") if p.strip()] if args.files else None

    validate_files_by_function_mode(args.files or [], args.function_mode)
    api_key = get_api_key()
    task_id = submit_task(api_key, args)
    print("task_id:", task_id, file=sys.stderr)
    print("Note: Generation may take up to 3 hours depending on load.", file=sys.stderr)
    result = poll_result(api_key, task_id)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as e:
        print("Request error:", e, file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)