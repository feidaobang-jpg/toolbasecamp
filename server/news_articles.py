"""News articles table (crawler + static site; no public API required)."""

from typing import Any


def ensure_news_tables(cur: Any) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS news_articles (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            source_url VARCHAR(768) NOT NULL,
            source_name VARCHAR(128) NOT NULL DEFAULT '',
            title VARCHAR(512) NOT NULL,
            summary TEXT NULL,
            content_html MEDIUMTEXT NOT NULL,
            cover_path VARCHAR(512) NULL,
            local_path VARCHAR(512) NOT NULL,
            published_at VARCHAR(32) NULL,
            created_at DOUBLE NOT NULL,
            UNIQUE KEY uq_news_source_url (source_url),
            KEY idx_news_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
