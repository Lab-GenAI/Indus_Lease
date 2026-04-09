from server_py.db import execute_query, execute_returning, execute_no_fetch


def get_sites():
    rows = execute_query("""
        SELECT s.*,
            COALESCE(lc.cnt, 0)::int AS lease_count,
            COALESCE(fc.cnt, 0)::int AS file_count,
            COALESCE(lc.cnt, 0)::int AS total_leases,
            COALESCE(ec.cnt, 0)::int AS completed_extractions
        FROM sites s
        LEFT JOIN (SELECT site_id, COUNT(*) AS cnt FROM leases GROUP BY site_id) lc ON lc.site_id = s.id
        LEFT JOIN (SELECT l.site_id, COUNT(*) AS cnt FROM files f JOIN leases l ON f.lease_id = l.id GROUP BY l.site_id) fc ON fc.site_id = s.id
        LEFT JOIN (SELECT l.site_id, COUNT(*) AS cnt FROM extractions e JOIN leases l ON e.lease_id = l.id WHERE e.status = 'completed' GROUP BY l.site_id) ec ON ec.site_id = s.id
        ORDER BY s.created_at DESC
    """)
    result = []
    for r in rows:
        total_leases = r["total_leases"]
        completed = r["completed_extractions"]
        if total_leases > 0 and completed == total_leases:
            extraction_status = "completed"
        elif completed > 0:
            extraction_status = "partial"
        else:
            extraction_status = "none"
        result.append({
            "id": r["id"],
            "siteId": r["site_id"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            "leaseCount": r["lease_count"],
            "fileCount": r["file_count"],
            "extractionStatus": extraction_status,
        })
    return result


def get_site(site_id: int):
    rows = execute_query("SELECT * FROM sites WHERE id = %s", (site_id,))
    return rows[0] if rows else None


def get_site_by_name(site_name: str):
    rows = execute_query("SELECT * FROM sites WHERE site_id = %s", (site_name,))
    return rows[0] if rows else None


def create_site(site_id_name: str):
    return execute_returning(
        "INSERT INTO sites (site_id) VALUES (%s) RETURNING *",
        (site_id_name,)
    )


def delete_site(site_id: int):
    execute_no_fetch("DELETE FROM cost_logs WHERE site_id = %s", (site_id,))
    execute_no_fetch("DELETE FROM sites WHERE id = %s", (site_id,))


def delete_all_sites():
    execute_no_fetch("DELETE FROM cost_logs")
    execute_no_fetch("DELETE FROM sites")


def get_leases_by_site(site_id: int):
    return execute_query(
        "SELECT * FROM leases WHERE site_id = %s ORDER BY lease_number",
        (site_id,)
    )


def get_lease(lease_id: int):
    rows = execute_query("SELECT * FROM leases WHERE id = %s", (lease_id,))
    return rows[0] if rows else None


def get_lease_by_number(site_id: int, lease_number: str):
    rows = execute_query(
        "SELECT * FROM leases WHERE site_id = %s AND lease_number = %s",
        (site_id, lease_number)
    )
    return rows[0] if rows else None


def create_lease(site_id: int, lease_number: str):
    return execute_returning(
        "INSERT INTO leases (site_id, lease_number) VALUES (%s, %s) RETURNING *",
        (site_id, lease_number)
    )


def update_lease_status(lease_id: int, status: str):
    execute_no_fetch(
        "UPDATE leases SET status = %s WHERE id = %s",
        (status, lease_id)
    )


def get_files_by_lease(lease_id: int):
    return execute_query(
        "SELECT * FROM files WHERE lease_id = %s",
        (lease_id,)
    )


def get_file(file_id: int):
    rows = execute_query("SELECT * FROM files WHERE id = %s", (file_id,))
    return rows[0] if rows else None


def get_file_type_counts_by_lease():
    rows = execute_query("""
        SELECT lease_id, file_type, COUNT(*) as count
        FROM files
        GROUP BY lease_id, file_type
        ORDER BY lease_id, file_type
    """)
    result = {}
    for r in rows:
        lid = r["lease_id"]
        if lid not in result:
            result[lid] = {}
        result[lid][r["file_type"]] = r["count"]
    return result


def file_exists_in_lease(lease_id: int, file_name: str, file_size: int) -> bool:
    rows = execute_query(
        "SELECT id FROM files WHERE lease_id = %s AND file_name = %s AND file_size = %s LIMIT 1",
        (lease_id, file_name, file_size)
    )
    return len(rows) > 0


def create_file(lease_id: int, file_name: str, file_type: str, file_path: str, file_size: int):
    return execute_returning(
        "INSERT INTO files (lease_id, file_name, file_type, file_path, file_size) VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (lease_id, file_name, file_type, file_path, file_size)
    )


def create_files_bulk(file_rows: list):
    if not file_rows:
        return
    from server_py.db import get_conn, put_conn
    from psycopg2.extras import execute_values, RealDictCursor
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            execute_values(
                cur,
                "INSERT INTO files (lease_id, file_name, file_type, file_path, file_size) VALUES %s",
                file_rows,
                template="(%s, %s, %s, %s, %s)"
            )
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def get_tags():
    return execute_query("SELECT * FROM tags ORDER BY name")


def get_tag(tag_id: int):
    rows = execute_query("SELECT * FROM tags WHERE id = %s", (tag_id,))
    return rows[0] if rows else None


def create_tag(name: str, description: str = None, category: str = None):
    return execute_returning(
        "INSERT INTO tags (name, description, category) VALUES (%s, %s, %s) RETURNING *",
        (name, description, category)
    )


def update_tag(tag_id: int, name: str = None, description: str = None, category: str = None):
    updates = []
    params = []
    if name is not None:
        updates.append("name = %s")
        params.append(name)
    if description is not None:
        updates.append("description = %s")
        params.append(description)
    if category is not None:
        updates.append("category = %s")
        params.append(category)
    if not updates:
        return get_tag(tag_id)
    params.append(tag_id)
    return execute_returning(
        f"UPDATE tags SET {', '.join(updates)} WHERE id = %s RETURNING *",
        tuple(params)
    )


def delete_tag(tag_id: int):
    execute_no_fetch("DELETE FROM tags WHERE id = %s", (tag_id,))


def delete_all_tags():
    execute_no_fetch("DELETE FROM tags")


def get_extractions():
    rows = execute_query("""
        SELECT e.*, l.lease_number, s.site_id
        FROM extractions e
        JOIN leases l ON e.lease_id = l.id
        JOIN sites s ON l.site_id = s.id
        ORDER BY e.created_at DESC
    """)
    return [_map_extraction(r) for r in rows]


def get_extraction_by_lease(lease_id: int):
    rows = execute_query(
        "SELECT * FROM extractions WHERE lease_id = %s",
        (lease_id,)
    )
    return rows[0] if rows else None


def create_extraction(lease_id: int, status: str = "pending"):
    return execute_returning(
        "INSERT INTO extractions (lease_id, status) VALUES (%s, %s) RETURNING *",
        (lease_id, status)
    )


def update_extraction(extraction_id: int, status: str = None, results=None, extracted_at=None):
    updates = []
    params = []
    if status is not None:
        updates.append("status = %s")
        params.append(status)
    if results is not None:
        import json
        updates.append("results = %s::jsonb")
        params.append(json.dumps(results))
    if extracted_at is not None:
        updates.append("extracted_at = %s")
        params.append(extracted_at)
    if not updates:
        return
    params.append(extraction_id)
    execute_no_fetch(
        f"UPDATE extractions SET {', '.join(updates)} WHERE id = %s",
        tuple(params)
    )


def upsert_extraction(lease_id: int, tag_name: str, value: str):
    import json as _json
    existing = execute_query(
        "SELECT id, results FROM extractions WHERE lease_id = %s ORDER BY created_at DESC LIMIT 1",
        (lease_id,)
    )
    if existing:
        ext = existing[0]
        current_results = ext.get("results") or {}
        current_results[tag_name] = value
        execute_no_fetch(
            "UPDATE extractions SET results = %s::jsonb WHERE id = %s",
            (_json.dumps(current_results), ext["id"])
        )
    else:
        results = {tag_name: value}
        execute_returning(
            "INSERT INTO extractions (lease_id, status, results) VALUES (%s, %s, %s::jsonb) RETURNING *",
            (lease_id, "processing", _json.dumps(results))
        )


def delete_extraction(extraction_id: int):
    rows = execute_query("SELECT lease_id FROM extractions WHERE id = %s", (extraction_id,))
    execute_no_fetch("DELETE FROM extractions WHERE id = %s", (extraction_id,))
    if rows:
        lease_id = rows[0]["lease_id"]
        remaining = execute_query(
            "SELECT id FROM extractions WHERE lease_id = %s LIMIT 1",
            (lease_id,)
        )
        if not remaining:
            execute_no_fetch("DELETE FROM cost_logs WHERE lease_id = %s", (lease_id,))


def delete_extractions(ids: list):
    if not ids:
        return
    placeholders = ",".join(["%s"] * len(ids))
    lease_rows = execute_query(
        f"SELECT DISTINCT lease_id FROM extractions WHERE id IN ({placeholders})",
        tuple(ids)
    )
    execute_no_fetch(f"DELETE FROM extractions WHERE id IN ({placeholders})", tuple(ids))
    for row in lease_rows:
        remaining = execute_query(
            "SELECT id FROM extractions WHERE lease_id = %s LIMIT 1",
            (row["lease_id"],)
        )
        if not remaining:
            execute_no_fetch("DELETE FROM cost_logs WHERE lease_id = %s", (row["lease_id"],))


def get_dashboard_stats():
    site_count = execute_query("SELECT COUNT(*)::int AS count FROM sites")[0]["count"]
    lease_count = execute_query("SELECT COUNT(*)::int AS count FROM leases")[0]["count"]
    file_count = execute_query("SELECT COUNT(*)::int AS count FROM files")[0]["count"]
    tag_count = execute_query("SELECT COUNT(*)::int AS count FROM tags")[0]["count"]

    extraction_rows = execute_query("SELECT status, COUNT(*)::int AS count FROM extractions GROUP BY status")
    extraction_stats = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
    for r in extraction_rows:
        if r["status"] in extraction_stats:
            extraction_stats[r["status"]] = r["count"]

    recent_rows = execute_query("""
        SELECT e.*, l.lease_number, s.site_id
        FROM extractions e
        JOIN leases l ON e.lease_id = l.id
        JOIN sites s ON l.site_id = s.id
        ORDER BY e.created_at DESC
        LIMIT 5
    """)

    file_type_rows = execute_query("SELECT file_type, COUNT(*)::int AS count FROM files GROUP BY file_type")
    file_type_dist = {r["file_type"]: r["count"] for r in file_type_rows}

    return {
        "totalSites": site_count,
        "totalLeases": lease_count,
        "totalFiles": file_count,
        "totalTags": tag_count,
        "extractionStats": extraction_stats,
        "recentExtractions": [_map_extraction(r) for r in recent_rows],
        "fileTypeDistribution": file_type_dist,
    }


def _map_extraction(r):
    return {
        "id": r["id"],
        "leaseId": r["lease_id"],
        "status": r["status"],
        "results": r["results"],
        "extractedAt": r["extracted_at"].isoformat() if r.get("extracted_at") else None,
        "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
        "leaseNumber": r.get("lease_number", ""),
        "siteId": r.get("site_id", ""),
    }
