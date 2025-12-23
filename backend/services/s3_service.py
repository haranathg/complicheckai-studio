"""S3 service for document and result storage."""
import os
import json
import hashlib
from datetime import datetime
from typing import Optional, BinaryIO, Dict, Any
from io import BytesIO

import boto3
from botocore.exceptions import ClientError

# S3 configuration from environment
S3_BUCKET = os.getenv("S3_BUCKET", "")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-2")
AWS_PROFILE = os.getenv("AWS_PROFILE", "")

# Initialize S3 client
_s3_client = None


def get_s3_client():
    """Get or create S3 client."""
    global _s3_client
    if _s3_client is None:
        if AWS_PROFILE:
            # Use named profile from ~/.aws/credentials
            session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
            _s3_client = session.client("s3")
        else:
            # Fall back to default credential chain
            _s3_client = boto3.client("s3", region_name=AWS_REGION)
    return _s3_client


def compute_file_hash(file_content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(file_content).hexdigest()


def get_document_s3_key(project_id: str, document_id: str, filename: str) -> str:
    """Generate S3 key for a document."""
    # Sanitize filename
    safe_filename = "".join(c if c.isalnum() or c in ".-_" else "_" for c in filename)
    return f"projects/{project_id}/documents/{document_id}/{safe_filename}"


def get_parse_result_s3_key(project_id: str, document_id: str, parser: str) -> str:
    """Generate S3 key for a parse result."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"projects/{project_id}/documents/{document_id}/parse_results/{parser}_{timestamp}.json"


def upload_document(
    project_id: str,
    document_id: str,
    filename: str,
    file_content: bytes,
    content_type: str = "application/octet-stream"
) -> str:
    """
    Upload a document to S3.

    Returns the S3 key where the file was stored.
    """
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    s3_key = get_document_s3_key(project_id, document_id, filename)
    client = get_s3_client()

    client.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=file_content,
        ContentType=content_type,
        Metadata={
            "project_id": project_id,
            "document_id": document_id,
            "original_filename": filename,
        }
    )

    return s3_key


def upload_parse_result(
    project_id: str,
    document_id: str,
    parser: str,
    result_data: Dict[str, Any]
) -> str:
    """
    Upload parse result JSON to S3.

    Returns the S3 key where the result was stored.
    """
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    s3_key = get_parse_result_s3_key(project_id, document_id, parser)
    client = get_s3_client()

    # Serialize result to JSON
    json_content = json.dumps(result_data, indent=2, default=str)

    client.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=json_content.encode("utf-8"),
        ContentType="application/json",
        Metadata={
            "project_id": project_id,
            "document_id": document_id,
            "parser": parser,
        }
    )

    return s3_key


def download_document(s3_key: str) -> bytes:
    """Download a document from S3."""
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()

    response = client.get_object(Bucket=S3_BUCKET, Key=s3_key)
    return response["Body"].read()


def download_parse_result(s3_key: str) -> Dict[str, Any]:
    """Download and parse a JSON result from S3."""
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()

    response = client.get_object(Bucket=S3_BUCKET, Key=s3_key)
    content = response["Body"].read().decode("utf-8")
    return json.loads(content)


def get_presigned_url(s3_key: str, expiration: int = 3600) -> str:
    """
    Generate a presigned URL for downloading a file.

    Args:
        s3_key: The S3 object key
        expiration: URL expiration time in seconds (default 1 hour)

    Returns:
        Presigned URL string
    """
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()

    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=expiration
    )

    return url


def delete_document(s3_key: str) -> bool:
    """Delete a document from S3."""
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()

    try:
        client.delete_object(Bucket=S3_BUCKET, Key=s3_key)
        return True
    except ClientError:
        return False


def delete_project_folder(project_id: str) -> int:
    """
    Delete all files in a project folder.

    Returns the number of objects deleted.
    """
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()
    prefix = f"projects/{project_id}/"

    # List all objects with the project prefix
    paginator = client.get_paginator("list_objects_v2")
    deleted_count = 0

    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        if "Contents" not in page:
            continue

        objects_to_delete = [{"Key": obj["Key"]} for obj in page["Contents"]]

        if objects_to_delete:
            client.delete_objects(
                Bucket=S3_BUCKET,
                Delete={"Objects": objects_to_delete}
            )
            deleted_count += len(objects_to_delete)

    return deleted_count


def delete_document_folder(project_id: str, document_id: str) -> int:
    """
    Delete all files for a document (original + parse results).

    Returns the number of objects deleted.
    """
    if not S3_BUCKET:
        raise ValueError("S3_BUCKET environment variable is not set")

    client = get_s3_client()
    prefix = f"projects/{project_id}/documents/{document_id}/"

    # List all objects with the document prefix
    paginator = client.get_paginator("list_objects_v2")
    deleted_count = 0

    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        if "Contents" not in page:
            continue

        objects_to_delete = [{"Key": obj["Key"]} for obj in page["Contents"]]

        if objects_to_delete:
            client.delete_objects(
                Bucket=S3_BUCKET,
                Delete={"Objects": objects_to_delete}
            )
            deleted_count += len(objects_to_delete)

    return deleted_count


def file_exists(s3_key: str) -> bool:
    """Check if a file exists in S3."""
    if not S3_BUCKET:
        return False

    client = get_s3_client()

    try:
        client.head_object(Bucket=S3_BUCKET, Key=s3_key)
        return True
    except ClientError:
        return False


def list_parse_results(project_id: str, document_id: str) -> list:
    """
    List all parse results for a document.

    Returns list of dicts with key, parser, and last_modified.
    """
    if not S3_BUCKET:
        return []

    client = get_s3_client()
    prefix = f"projects/{project_id}/documents/{document_id}/parse_results/"

    results = []
    paginator = client.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        if "Contents" not in page:
            continue

        for obj in page["Contents"]:
            key = obj["Key"]
            filename = key.split("/")[-1]
            # Extract parser from filename (format: parser_timestamp.json)
            parser = filename.rsplit("_", 1)[0] if "_" in filename else filename.replace(".json", "")

            results.append({
                "key": key,
                "parser": parser,
                "last_modified": obj["LastModified"],
                "size": obj["Size"],
            })

    return sorted(results, key=lambda x: x["last_modified"], reverse=True)
