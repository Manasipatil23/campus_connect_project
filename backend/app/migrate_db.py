"""Copy every collection (documents and indexes) from one MongoDB to another, e.g. local -> Atlas.

    .venv/bin/python -m app.migrate_db            # from MONGO_URL to ATLAS_URL (both in backend/.env)
    .venv/bin/python -m app.migrate_db --replace  # also empty collections that already exist in Atlas

Reads the target link from ATLAS_URL in backend/.env so the password never goes on the command line.
Nothing is deleted from the source.
"""
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()
from .config import DB_NAME, MONGO_URL  # noqa: E402
from .db import client_options  # noqa: E402


def hide(url: str) -> str:
    """mongodb+srv://user:secret@host -> mongodb+srv://user:***@host"""
    if "@" not in url or "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.split("@", 1)
    return f"{scheme}://{creds.split(':', 1)[0]}:***@{host}"


def main():
    target_url = os.getenv("ATLAS_URL", "").strip()
    source_url = os.getenv("MIGRATE_FROM", MONGO_URL)
    if not target_url:
        sys.exit("Add ATLAS_URL=<your Atlas connection link> to backend/.env first.")
    if target_url == source_url:
        sys.exit("ATLAS_URL is the same as the source database; nothing to copy.")
    replace = "--replace" in sys.argv

    src = MongoClient(source_url, serverSelectionTimeoutMS=8000, **client_options(source_url))[DB_NAME]
    dst_client = MongoClient(target_url, serverSelectionTimeoutMS=15000, **client_options(target_url))
    dst_client.admin.command("ping")
    dst = dst_client[DB_NAME]
    print(f"From {hide(source_url)}  ->  {hide(target_url)}   (database '{DB_NAME}')")

    for name in sorted(src.list_collection_names()):
        docs = list(src[name].find())
        existing = dst[name].estimated_document_count()
        if existing and not replace:
            print(f"  skip {name:16} Atlas already has {existing} documents (use --replace to overwrite)")
            continue
        dst[name].delete_many({})
        if docs:
            dst[name].insert_many(docs, ordered=False)
        for idx_name, info in src[name].index_information().items():
            if idx_name == "_id_":
                continue
            opts = {k: v for k, v in info.items() if k in ("unique", "sparse", "expireAfterSeconds")}
            dst[name].create_index(info["key"], name=idx_name, **opts)
        print(f"  copied {name:16} {len(docs)} documents")
    print("Done. Now set MONGO_URL in backend/.env to the Atlas link and restart the backend.")


if __name__ == "__main__":
    main()
