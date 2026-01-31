"""
PostgreSQL connection module

Raw psycopg2 connection without pooling.
Minimal, interview-safe implementation.
"""
import os
import psycopg2
import logging

logger = logging.getLogger(__name__)


def get_connection():
    """
    Create a new PostgreSQL connection.

    No connection pooling - each write is independent.
    Reads credentials from environment variables.

    Returns:
        psycopg2 connection object

    Raises:
        psycopg2.Error: If connection fails
    """
    try:
        conn = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=os.getenv("POSTGRES_PORT", "5432"),
            database=os.getenv("POSTGRES_DB", "rexcan"),
            user=os.getenv("POSTGRES_USER", "postgres"),
            password=os.getenv("POSTGRES_PASSWORD", "")
        )
        return conn
    except psycopg2.Error as e:
        logger.error(f"PostgreSQL connection failed: {e}")
        raise


def execute_query(query: str, params: tuple = None):
    """
    Execute a SELECT query and return results.

    Args:
        query: SQL query string
        params: Query parameters (optional)

    Returns:
        List of tuples (rows)
    """
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        if conn:
            conn.close()


def execute_write(query: str, params: tuple = None):
    """
    Execute an INSERT/UPDATE query with auto-commit.

    Args:
        query: SQL query string
        params: Query parameters (optional)

    Returns:
        Number of affected rows
    """
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
            return cur.rowcount
    except Exception as e:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
