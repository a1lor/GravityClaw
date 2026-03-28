import { db } from "./db.js";

interface KgNode {
    id: number;
    entity: string;
    type: string;
    properties: Record<string, any>;
    created_at: string;
}

interface KgEdge {
    id: number;
    source: string;
    target: string;
    relation: string;
    created_at: string;
}

const stmtUpsertNode = db.prepare(`
    INSERT INTO kg_nodes (entity, type, properties) 
    VALUES (?, ?, ?)
    ON CONFLICT(entity) DO UPDATE SET 
        type = excluded.type,
        properties = excluded.properties
`);

const stmtInsertEdge = db.prepare(`
    INSERT OR IGNORE INTO kg_edges (source, target, relation)
    VALUES (?, ?, ?)
`);

const stmtGetNode = db.prepare(`SELECT * FROM kg_nodes WHERE entity = ? COLLATE NOCASE`);

const stmtGetEdges = db.prepare(`
    SELECT * FROM kg_edges 
    WHERE source = ? COLLATE NOCASE OR target = ? COLLATE NOCASE
    ORDER BY created_at DESC
    LIMIT 20
`);

export function addKnowledgeGraphRelation(
    sourceEntity: string,
    sourceType: string,
    targetEntity: string,
    targetType: string,
    relation: string,
    properties: Record<string, any> = {}
): boolean {
    const s = sourceEntity.trim().toLowerCase();
    const t = targetEntity.trim().toLowerCase();
    const r = relation.trim().toLowerCase();
    if (!s || !t || !r) return false;

    db.transaction(() => {
        const propsStr = JSON.stringify(properties);
        stmtUpsertNode.run(s, sourceType.toLowerCase(), propsStr);
        stmtUpsertNode.run(t, targetType.toLowerCase(), "{}");
        stmtInsertEdge.run(s, t, r);
    })();
    return true;
}

export function queryKnowledgeGraph(entity: string): string {
    const e = entity.trim().toLowerCase();
    const node = stmtGetNode.get(e) as any;
    if (!node) return `No knowledge graph data found for entity: ${entity}`;

    const edges = stmtGetEdges.all(e, e) as any[];
    if (edges.length === 0) return `Entity "${entity}" exists (type: ${node.type}), but has no relations.`;

    const lines = edges.map((edge) => {
        if (edge.source === e) {
            return `  - [${entity}] --(${edge.relation.toUpperCase()})--> [${edge.target}]`;
        } else {
            return `  - [${edge.source}] --(${edge.relation.toUpperCase()})--> [${entity}]`;
        }
    });

    return `Knowledge Graph for "${entity}" (Type: ${node.type}):\n${lines.join("\n")}`;
}
