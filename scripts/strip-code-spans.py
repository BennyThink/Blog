#!/usr/bin/env python3
"""Clean imported WordPress span wrappers from EmDash post code blocks."""

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
import tempfile


SPAN = re.compile(r"""</?span(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>""", re.I)
IMPORTED_OPENING = re.compile(r"<span\s+(?:style|class)\s*=", re.I)


def clean_blocks(content):
    changed = 0
    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict) or block.get("_type") != "code":
                continue
            code = block.get("code")
            if not isinstance(code, str):
                continue
            openings = [
                tag.group() for tag in SPAN.finditer(code)
                if not tag.group().startswith("</")
            ]
            if openings and all(IMPORTED_OPENING.match(tag) for tag in openings):
                block["code"] = SPAN.sub("", code)
                changed += 1
    return changed


def backup_database(uri, path):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=f"{path.name}.{timestamp}.", suffix=".bak",
        delete=False,
    ) as backup_file:
        backup_path = Path(backup_file.name)

    try:
        with closing(sqlite3.connect(uri + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(backup_path)) as target:
                source.backup(target)
                if target.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise RuntimeError("Backup failed SQLite quick_check")
    except BaseException:
        backup_path.unlink()
        raise

    print(f"Backup verified: {backup_path}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--apply", action="store_true", help="Back up and write changes")
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    uri = path.as_uri()

    with closing(sqlite3.connect(
        uri + ("?mode=rw" if args.apply else "?mode=ro"), uri=True, timeout=15,
    )) as db, db:
        db.execute("BEGIN IMMEDIATE" if args.apply else "BEGIN")
        changes = []
        for post_id, slug, raw in db.execute("""
            SELECT id, slug, content FROM ec_posts
            WHERE deleted_at IS NULL AND instr(lower(content), '<span') > 0
        """):
            content = json.loads(raw)
            count = clean_blocks(content)
            if count:
                print(f"Post {slug}: {count} code block(s)")
                changes.append(("UPDATE ec_posts SET content = ? WHERE id = ?", content, post_id))

        for revision_id, slug, raw in db.execute("""
            SELECT r.id, p.slug, r.data
            FROM ec_posts AS p
            JOIN revisions AS r ON r.entry_id = p.id
                AND r.id IN (p.live_revision_id, p.draft_revision_id)
            WHERE p.deleted_at IS NULL AND r.collection = 'posts'
                AND instr(lower(r.data), '<span') > 0
        """):
            data = json.loads(raw)
            count = clean_blocks(data.get("content"))
            if count:
                print(f"Current revision of {slug}: {count} code block(s)")
                changes.append(("UPDATE revisions SET data = ? WHERE id = ?", data, revision_id))

        if args.apply and changes:
            backup_database(uri, path)
            for statement, value, row_id in changes:
                db.execute(statement, (json.dumps(value, ensure_ascii=False), row_id))

    action = "Updated" if args.apply else "Would update"
    print(f"{action} {len(changes)} database row(s).")


if __name__ == "__main__":
    main()
