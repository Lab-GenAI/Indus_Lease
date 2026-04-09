import os
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "")

connection_pool = pool.ThreadedConnectionPool(2, 50, DATABASE_URL)


def get_conn():
    return connection_pool.getconn()


def put_conn(conn):
    connection_pool.putconn(conn)


def execute_query(query: str, params=None, fetch=True):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch:
                rows = cur.fetchall()
                conn.commit()
                return rows
            conn.commit()
            return None
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def execute_returning(query: str, params=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            conn.commit()
            return row
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def execute_no_fetch(query: str, params=None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)
