-- Trigram matching is what lets a substring search on file names use an index
-- instead of scanning every row in the data room.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex
DROP INDEX "nodes_dataRoomId_path_idx";

-- DropIndex
DROP INDEX "nodes_dataRoomId_type_nameKey_idx";

-- Subtree queries are `path LIKE '/a/b/%'`. Under the database's default
-- collation a plain btree cannot answer that; `text_pattern_ops` compares
-- character by character, which is exactly what a prefix match needs.
CREATE INDEX "nodes_dataRoomId_path_idx" ON "nodes"("dataRoomId", "path" text_pattern_ops);

-- CreateIndex
CREATE INDEX "nodes_nameKey_idx" ON "nodes" USING GIN ("nameKey" gin_trgm_ops);
