"""Independent chemistry workspace. Frozen migration; never touches main tables."""

from alembic import op

revision = "cg0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    statements = [
        "CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
        "CREATE TABLE points (id TEXT PRIMARY KEY,external_id TEXT UNIQUE NOT NULL,data TEXT NOT NULL,raw TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL)",
        "CREATE TABLE questions (id TEXT PRIMARY KEY,external_id TEXT UNIQUE NOT NULL,point_id TEXT NOT NULL REFERENCES points(id),data TEXT NOT NULL,raw TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL)",
        "CREATE TABLE edges (id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES points(id),prerequisite_id TEXT NOT NULL REFERENCES points(id),strength TEXT NOT NULL CHECK(strength IN ('hard','soft')),reason TEXT NOT NULL,status TEXT NOT NULL,raw TEXT NOT NULL,UNIQUE(topic_id,prerequisite_id),CHECK(topic_id<>prerequisite_id))",
        "CREATE TABLE sources (id TEXT PRIMARY KEY,data TEXT NOT NULL)",
        "CREATE TABLE archive (table_name TEXT NOT NULL,row_key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(table_name,row_key))",
        "CREATE TABLE history (id TEXT PRIMARY KEY,kind TEXT NOT NULL,entity_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL)",
        "CREATE TABLE imports (id TEXT PRIMARY KEY,manifest TEXT NOT NULL,created_at TEXT NOT NULL)",
        "CREATE TABLE view_state (key TEXT PRIMARY KEY,data TEXT NOT NULL)",
        "CREATE TABLE sessions (id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL)",
        "CREATE TABLE audit (id TEXT PRIMARY KEY,action TEXT NOT NULL,entity_id TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL)",
        "CREATE TABLE question_assets (id TEXT PRIMARY KEY,storage_name TEXT UNIQUE NOT NULL,original_name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at TEXT NOT NULL)",
        "CREATE INDEX ix_cg_questions_point ON questions(point_id,status)",
        "CREATE INDEX ix_cg_edges_pre ON edges(prerequisite_id)",
        "CREATE INDEX ix_cg_history_entity ON history(entity_id,version)",
    ]
    for statement in statements:
        op.execute(statement)
    op.execute("""CREATE TRIGGER cg_edge_cycle BEFORE INSERT ON edges BEGIN
    SELECT RAISE(ABORT,'cycle') WHERE EXISTS(WITH RECURSIVE ancestors(id) AS (SELECT NEW.prerequisite_id UNION SELECT e.prerequisite_id FROM edges e JOIN ancestors a ON e.topic_id=a.id) SELECT 1 FROM ancestors WHERE id=NEW.topic_id); END""")


def downgrade():
    raise RuntimeError("请使用独立图谱已验证备份恢复，不支持破坏性降级")
