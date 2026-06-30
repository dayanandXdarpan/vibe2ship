"""
Image Redactor Service — Server-side PII Redaction
"""
import io
import json
import re
import logging
import httpx
from PIL import Image, ImageFilter
from config import get_settings
from firebase_admin import storage as firebase_storage

logger = logging.getLogger(__name__)
settings = get_settings()

REDACT_PROMPT = """
You are an image security auditor. Your task is to identify the location of all Personally Identifiable Information (PII) in this image, specifically:
1. Human faces
2. Vehicle license plates
3. Specific house/apartment numbers

For each PII element detected, return its bounding box coordinates in the format [ymin, xmin, ymax, xmax].
All coordinates must be float values normalized between 0.0 and 1.0 relative to the image height and width.
- ymin/ymax are relative to the top border (0.0 is top, 1.0 is bottom).
- xmin/xmax are relative to the left border (0.0 is left, 1.0 is right).

Return ONLY a valid JSON object with the key "boxes" mapping to a list of bounding boxes:
{
  "boxes": [
    [ymin, xmin, ymax, xmax],
    ...
  ]
}

If no PII elements are found, return:
{
  "boxes": []
}

Do not include any explanation or markdown blocks. Just the raw JSON.
"""

async def download_image_bytes(image_url: str) -> bytes:
    """Download image content from URL."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(image_url)
        response.raise_for_status()
        return response.content

async def detect_pii_boxes(image_bytes: bytes, mime_type: str = "image/jpeg") -> list[list[float]]:
    """Query Gemini for PII bounding boxes."""
    import google.generativeai as genai
    import base64
    
    genai.configure(api_key=settings.gemini_api_key)
    
    b64_data = base64.b64encode(image_bytes).decode("utf-8")
    
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([
            {"mime_type": mime_type, "data": b64_data},
            REDACT_PROMPT
        ])
        
        raw_text = response.text.strip()
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            return result.get("boxes", [])
        return []
    except Exception as e:
        logger.warning(f"[REDACTOR] Gemini PII bounding box call failed: {e}")
        return []

def blur_bounding_boxes(image_bytes: bytes, boxes: list[list[float]]) -> bytes:
    """Use Pillow to crop, blur, and paste back the specified regions."""
    if not boxes:
        return image_bytes
        
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Keep track of original format
        orig_format = img.format or "JPEG"
        width, height = img.size
        
        modified = False
        for box in boxes:
            if len(box) != 4:
                continue
            ymin, xmin, ymax, xmax = box
            
            # Map normalized [0,1] coordinates to pixel dimensions
            left = int(xmin * width)
            top = int(ymin * height)
            right = int(xmax * width)
            bottom = int(ymax * height)
            
            # Clamp to image boundaries
            left = max(0, min(left, width - 1))
            top = max(0, min(top, height - 1))
            right = max(left + 1, min(right, width))
            bottom = max(top + 1, min(bottom, height))
            
            if right > left and bottom > top:
                # Crop the box region
                box_region = img.crop((left, top, right, bottom))
                # Apply strong Gaussian blur
                blurred_region = box_region.filter(ImageFilter.GaussianBlur(radius=20))
                # Paste back
                img.paste(blurred_region, (left, top, right, bottom))
                modified = True
                
        if not modified:
            return image_bytes
            
        out_buf = io.BytesIO()
        img.save(out_buf, format=orig_format, quality=90)
        return out_buf.getvalue()
    except Exception as e:
        logger.error(f"[REDACTOR] Pillow image blurring failed: {e}")
        return image_bytes

async def redact_pii_server_side(issue_id: str, image_url: str) -> str:
    """
    Server-side image redaction workflow.
    Downloads the image, blurs detected PII, uploads blurred file, and returns new URL.
    Falls back to original image_url on any failure (fail-open for reliability).
    """
    logger.info(f"[REDACTOR] Running server-side PII redaction for issue {issue_id}")
    try:
        image_bytes = await download_image_bytes(image_url)
        boxes = await detect_pii_boxes(image_bytes)
        
        if not boxes:
            logger.info(f"[REDACTOR] No PII bounding boxes returned for issue {issue_id}")
            return image_url
            
        logger.info(f"[REDACTOR] Blurring {len(boxes)} PII regions for issue {issue_id}")
        redacted_bytes = blur_bounding_boxes(image_bytes, boxes)
        
        # Upload blurred image to Firebase Storage
        bucket = firebase_storage.bucket(name=settings.gcs_bucket_name or None)
        # Check if bucket is accessible
        if not bucket:
            logger.warning("[REDACTOR] Firebase Storage bucket unavailable. Skipping upload.")
            return image_url
            
        blob_path = f"issues/{issue_id}_blurred.jpg"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(redacted_bytes, content_type="image/jpeg")
        
        try:
            blob.make_public()
            new_url = blob.public_url
            logger.info(f"[REDACTOR] Redacted image uploaded: {new_url}")
            return new_url
        except Exception as pe:
            logger.warning(f"[REDACTOR] Failed to make blob public: {pe}. Trying signed URL.")
            try:
                new_url = blob.generate_signed_url(expiration=315360000)
                return new_url
            except Exception:
                pass
            return image_url
            
    except Exception as e:
        logger.error(f"[REDACTOR] Server-side PII redaction failed for {issue_id}: {e}. Falling back to original image.")
        return image_url
