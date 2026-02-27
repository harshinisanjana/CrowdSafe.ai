"""
convert_coco_to_yolo.py
-----------------------
Converts COCO 2017 JSON annotations → YOLO .txt label files.
Only keeps 'person' detections (category_id == 1 in COCO).

Run once from the ai-pipeline/ directory:
    python convert_coco_to_yolo.py
"""

import json
import os
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths (relative to ai-pipeline/)
# ---------------------------------------------------------------------------
BASE = Path(__file__).parent.parent  # CrowdSafe.ai/

DATASET_DIR = BASE / "crowd_dataset"

# Annotation JSONs
TRAIN_JSON = DATASET_DIR / "annotations_trainval2017" / "annotations" / "instances_train2017.json"
VAL_JSON   = DATASET_DIR / "annotations_trainval2017" / "annotations" / "instances_val2017.json"

# Images live in a nested subfolder: crowd_dataset/val2017/val2017/
VAL_IMG_DIR   = DATASET_DIR / "val2017" / "val2017"
TRAIN_IMG_DIR = DATASET_DIR / "train2017"  # only if downloaded

# YOLO expects labels to mirror the image directory structure relative to `path:`
# Since YAML has: train/val = val2017/val2017, labels go to labels/val2017/val2017/
LABEL_DIR = DATASET_DIR / "labels" / "val2017" / "val2017"

PERSON_CATEGORY_ID = 1  # COCO uses 1-indexed; person = 1


# ---------------------------------------------------------------------------

def convert(annotation_file: Path, image_dir: Path, label_dir: Path) -> None:
    if not annotation_file.exists():
        print(f"[SKIP] Annotation file not found: {annotation_file}")
        return

    print(f"\n[Convert] Reading {annotation_file.name} ...")
    with open(annotation_file) as f:
        coco = json.load(f)

    # Build image_id → metadata map
    images = {img["id"]: img for img in coco["images"]}

    # Group person annotations by image_id (skip crowd annotations)
    ann_by_img = defaultdict(list)
    for ann in coco["annotations"]:
        if ann.get("category_id") == PERSON_CATEGORY_ID and not ann.get("iscrowd", 0):
            ann_by_img[ann["image_id"]].append(ann)

    label_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    skipped = 0

    for img_id, anns in ann_by_img.items():
        img   = images[img_id]
        W, H  = img["width"], img["height"]
        stem  = Path(img["file_name"]).stem
        label_path = label_dir / f"{stem}.txt"

        lines = []
        for ann in anns:
            x, y, w, h = ann["bbox"]          # COCO: top-left x,y + width + height
            if w <= 0 or h <= 0:
                continue
            cx = (x + w / 2) / W              # normalised centre-x
            cy = (y + h / 2) / H              # normalised centre-y
            nw = w / W                         # normalised width
            nh = h / H                         # normalised height
            lines.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")  # class 0 = person

        if lines:
            label_path.write_text("\n".join(lines) + "\n")
            written += 1
        else:
            skipped += 1

    print(f"  ✅  Written : {written:,} label files → {label_dir}")
    print(f"  ⏭  Skipped : {skipped:,} images (no person annotations)")


def main() -> None:
    print("=" * 60)
    print("CrowdSafe AI – COCO → YOLO Label Converter")
    print("=" * 60)

    if not VAL_IMG_DIR.exists():
        print(f"[ERROR] Images not found at: {VAL_IMG_DIR}")
        return

    # Convert val annotations and write labels to LABEL_DIR
    convert(VAL_JSON, VAL_IMG_DIR, LABEL_DIR)

    print("\n✅  Conversion complete. You can now run training.")


if __name__ == "__main__":
    main()
