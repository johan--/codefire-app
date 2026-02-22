import Foundation
import GRDB

/// Hybrid search engine combining semantic (cosine similarity) and keyword (FTS5) results.
struct ChunkSearchEngine {

    struct SearchResult {
        let file: String           // relative path
        let symbol: String?
        let type: String           // chunk type
        let lines: String?         // "245-280"
        let score: Float
        let content: String
    }

    /// Search for chunks matching a query using hybrid ranking.
    /// - Parameters:
    ///   - queryVector: The embedded query (1536-dim Float array)
    ///   - projectId: Project to search within
    ///   - query: Original query text for FTS5 keyword search
    ///   - limit: Max results (default 10, max 30)
    ///   - types: Optional filter by chunk type
    ///   - db: Database queue to read from
    static func search(
        queryVector: [Float],
        projectId: String,
        query: String,
        limit: Int = 10,
        types: [String]? = nil,
        db: DatabaseQueue
    ) throws -> [SearchResult] {
        let effectiveLimit = min(max(limit, 1), 30)

        // 1. Semantic search — cosine similarity against all embeddings
        let semanticResults = try semanticSearch(
            queryVector: queryVector,
            projectId: projectId,
            types: types,
            db: db
        )

        // 2. Keyword search — FTS5 match
        let keywordResults = try keywordSearch(
            query: query,
            projectId: projectId,
            types: types,
            db: db
        )

        // 3. Merge and rank
        return mergeResults(
            semantic: semanticResults,
            keyword: keywordResults,
            limit: effectiveLimit
        )
    }

    // MARK: - Semantic Search

    private struct ScoredChunk {
        let chunk: CodeChunk
        let file: String
        let score: Float
    }

    private static func semanticSearch(
        queryVector: [Float],
        projectId: String,
        types: [String]?,
        db: DatabaseQueue
    ) throws -> [ScoredChunk] {
        // Load all chunks with embeddings for this project
        let chunks: [(CodeChunk, String)] = try db.read { conn in
            var sql = """
                SELECT c.*, f.relativePath
                FROM codeChunks c
                JOIN indexedFiles f ON c.fileId = f.id
                WHERE c.projectId = ? AND c.embedding IS NOT NULL
            """
            var args: [DatabaseValueConvertible] = [projectId]

            if let types = types, !types.isEmpty {
                let placeholders = types.map { _ in "?" }.joined(separator: ", ")
                sql += " AND c.chunkType IN (\(placeholders))"
                args.append(contentsOf: types)
            }

            let rows = try Row.fetchAll(conn, sql: sql, arguments: StatementArguments(args))
            return try rows.map { row in
                let chunk = try CodeChunk(row: row)
                let path = row["relativePath"] as String
                return (chunk, path)
            }
        }

        // Compute cosine similarity for each
        var scored: [ScoredChunk] = []
        for (chunk, path) in chunks {
            guard let vector = chunk.embeddingVector else { continue }
            let sim = cosineSimilarity(queryVector, vector)
            if sim > 0.3 {  // Minimum threshold
                scored.append(ScoredChunk(chunk: chunk, file: path, score: sim))
            }
        }

        scored.sort { $0.score > $1.score }
        return Array(scored.prefix(50))  // Keep top 50 for merging
    }

    // MARK: - Keyword Search

    private static func keywordSearch(
        query: String,
        projectId: String,
        types: [String]?,
        db: DatabaseQueue
    ) throws -> [ScoredChunk] {
        return try db.read { conn in
            // FTS5 match query — escape special characters
            let ftsQuery = query
                .replacingOccurrences(of: "\"", with: "\"\"")
                .components(separatedBy: .whitespaces)
                .filter { !$0.isEmpty }
                .map { "\"\($0)\"" }
                .joined(separator: " OR ")

            guard !ftsQuery.isEmpty else { return [] }

            var sql = """
                SELECT c.*, f.relativePath, bm25(codeChunksFts) AS rank
                FROM codeChunksFts fts
                JOIN codeChunks c ON c.rowid = fts.rowid
                JOIN indexedFiles f ON c.fileId = f.id
                WHERE codeChunksFts MATCH ? AND c.projectId = ?
            """
            var args: [DatabaseValueConvertible] = [ftsQuery, projectId]

            if let types = types, !types.isEmpty {
                let placeholders = types.map { _ in "?" }.joined(separator: ", ")
                sql += " AND c.chunkType IN (\(placeholders))"
                args.append(contentsOf: types)
            }

            sql += " ORDER BY rank LIMIT 50"

            let rows = try Row.fetchAll(conn, sql: sql, arguments: StatementArguments(args))

            // Normalize BM25 scores to 0-1 range
            let ranks = rows.compactMap { $0["rank"] as? Double }
            let maxRank = ranks.map { abs($0) }.max() ?? 1.0

            return try rows.map { row in
                let chunk = try CodeChunk(row: row)
                let path = row["relativePath"] as String
                let rank = abs(row["rank"] as? Double ?? 0)
                let normalized = Float(rank / max(maxRank, 0.001))
                return ScoredChunk(chunk: chunk, file: path, score: normalized)
            }
        }
    }

    // MARK: - Merge

    private static func mergeResults(
        semantic: [ScoredChunk],
        keyword: [ScoredChunk],
        limit: Int
    ) -> [SearchResult] {
        // Combine scores: 70% semantic, 30% keyword
        var combined: [String: (chunk: ScoredChunk, semanticScore: Float, keywordScore: Float)] = [:]

        for s in semantic {
            combined[s.chunk.id] = (chunk: s, semanticScore: s.score, keywordScore: 0)
        }

        for k in keyword {
            if var existing = combined[k.chunk.id] {
                existing.keywordScore = k.score
                combined[k.chunk.id] = existing
            } else {
                combined[k.chunk.id] = (chunk: k, semanticScore: 0, keywordScore: k.score)
            }
        }

        let ranked = combined.values
            .map { entry -> (ScoredChunk, Float) in
                let final = (0.7 * entry.semanticScore) + (0.3 * entry.keywordScore)
                return (entry.chunk, final)
            }
            .sorted { $0.1 > $1.1 }
            .prefix(limit)

        return ranked.map { (scored, finalScore) in
            let lines: String? = {
                if let start = scored.chunk.startLine, let end = scored.chunk.endLine {
                    return "\(start)-\(end)"
                }
                return nil
            }()

            return SearchResult(
                file: scored.file,
                symbol: scored.chunk.symbolName,
                type: scored.chunk.chunkType,
                lines: lines,
                score: finalScore,
                content: scored.chunk.content
            )
        }
    }

    // MARK: - Cosine Similarity

    static func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        var dot: Float = 0
        var normA: Float = 0
        var normB: Float = 0
        for i in 0..<a.count {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        let denom = sqrt(normA) * sqrt(normB)
        guard denom > 0 else { return 0 }
        return dot / denom
    }
}
