import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type LineageNodeKind = "dataset" | "column" | "transform";

export interface ColumnLineageNode {
  id: string;
  kind: LineageNodeKind;
  name: string;
  datasetId: string | null;
  dataType: string | null;
  transformKind: string | null;
}

export interface ColumnLineageEdge {
  from: string;
  to: string;
  transformKind: string;
  transformOrder: number;
}

export interface ColumnLineageView {
  datasetId: string;
  datasetName: string;
  columnId: string;
  columnName: string;
  nodes: ColumnLineageNode[];
  edges: ColumnLineageEdge[];
  generatedAt: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  columnCount: number;
  isActive: boolean;
}

export interface DatasetColumn {
  id: string;
  datasetId: string;
  name: string;
  dataType: string | null;
  description: string | null;
  isPrimaryKey: boolean;
  position: number;
}

interface Row {
  [key: string]: unknown;
}

// =============================================================================
// SERVICE
// =============================================================================

export class DatasetColumnLineageService {
  // ---------------------------------------------------------------------------
  // DATASETS
  // ---------------------------------------------------------------------------

  async listDatasets(filters?: { category?: string }): Promise<DatasetSummary[]> {
    const db = getDatabase();

    const rows = (await db("datasets as d")
      .select(
        "d.id",
        "d.name",
        "d.display_name",
        "d.description",
        "d.category",
        "d.is_active",
        db.raw("count(distinct c.id)::int as column_count")
      )
      .leftJoin("dataset_columns as c", "c.dataset_id", "d.id")
      .modify((qb) => {
        if (filters?.category) {
          qb.where("d.category", filters.category);
        }
      })
      .groupBy("d.id")
      .orderBy("d.name")) as Row[];

    return rows.map((row) => this.mapDataset(row));
  }

  async getDataset(id: string): Promise<DatasetSummary | null> {
    const db = getDatabase();
    const rows = (await db("datasets as d")
      .select(
        "d.id",
        "d.name",
        "d.display_name",
        "d.description",
        "d.category",
        "d.is_active",
        db.raw("count(distinct c.id)::int as column_count")
      )
      .leftJoin("dataset_columns as c", "c.dataset_id", "d.id")
      .where("d.id", id)
      .groupBy("d.id")
      .first()) as Row | undefined;

    return rows ? this.mapDataset(rows) : null;
  }

  async listColumns(datasetId: string): Promise<DatasetColumn[]> {
    const db = getDatabase();
    const rows = (await db("dataset_columns")
      .where({ dataset_id: datasetId })
      .orderBy("position")) as Row[];

    return rows.map((row) => this.mapColumn(row));
  }

  async createDataset(input: {
    name: string;
    displayName: string;
    description?: string;
    category?: string;
    columns?: Array<{ name: string; dataType?: string; description?: string; isPrimaryKey?: boolean }>;
    sourceDatasetId?: string;
    createdBy?: string;
  }): Promise<DatasetSummary> {
    const db = getDatabase();

    return db.transaction(async (trx) => {
      const [datasetRow] = await trx("datasets")
        .insert({
          name: input.name.trim(),
          display_name: input.displayName.trim(),
          description: input.description ?? null,
          category: input.category ?? "observability",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      let position = 0;
      const columns: DatasetColumn[] = [];
      for (const col of input.columns ?? []) {
        const [columnRow] = await trx("dataset_columns")
          .insert({
            dataset_id: datasetRow.id,
            name: col.name.trim(),
            data_type: col.dataType ?? null,
            description: col.description ?? null,
            is_primary_key: col.isPrimaryKey ?? false,
            position: position++,
          })
          .returning("*");
        columns.push(this.mapColumn(columnRow));
      }

      // Optionally mirror lineage from a source dataset (copy semantics).
      const lineageRows: Array<{ column_id: string; source_column_id: string }> = [];
      if (input.sourceDatasetId && columns.length > 0) {
        const sourceColumns = (await trx("dataset_columns")
          .where({ dataset_id: input.sourceDatasetId })
          .orderBy("position")) as Row[];

        sourceColumns.forEach((sourceColumn, index) => {
          const targetColumn = columns[index];
          if (!targetColumn) return;
          lineageRows.push({
            column_id: targetColumn.id,
            source_column_id: String(sourceColumn.id),
          });
        });

        for (const edge of lineageRows) {
          await trx("dataset_column_lineage").insert({
            dataset_id: datasetRow.id,
            column_id: edge.column_id,
            source_dataset_id: input.sourceDatasetId,
            source_column_id: edge.source_column_id,
            transform_kind: "copy",
            transform_order: 0,
            transform_metadata: JSON.stringify({ source: "mirror" }),
            created_by: input.createdBy ?? null,
          });
        }
      }

      logger.info(
        {
          feature: "dataset_column_lineage",
          action: "dataset_created",
          dataset_id: datasetRow.id,
          column_count: columns.length,
        },
        "Dataset created"
      );

      return {
        id: datasetRow.id,
        name: datasetRow.name,
        displayName: datasetRow.display_name,
        description: datasetRow.description ?? null,
        category: datasetRow.category,
        columnCount: columns.length,
        isActive: datasetRow.is_active,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // LINEAGE
  // ---------------------------------------------------------------------------

  /**
   * Build the full column lineage view (upstream + downstream) for a given
   * target column. Returns a graph of nodes and edges without mutating state.
   */
  async getColumnLineage(datasetId: string, columnId: string): Promise<ColumnLineageView | null> {
    const db = getDatabase();

    const column = (await db("dataset_columns as c")
      .join("datasets as d", "d.id", "c.dataset_id")
      .where({ "c.id": columnId, "c.dataset_id": datasetId })
      .select("c.*", "d.name as dataset_name")
      .first()) as Row | undefined;

    if (!column) {
      return null;
    }

    const rawEdges = (await db("dataset_column_lineage")
      .where({ column_id: columnId })) as Row[];

    const nodes = new Map<string, ColumnLineageNode>();
    const edges: ColumnLineageEdge[] = [];

    // Target node itself.
    nodes.set(columnId, {
      id: columnId,
      kind: "column",
      name: String(column.name),
      datasetId,
      dataType: column.data_type ? String(column.data_type) : null,
      transformKind: null,
    });

    for (const edge of rawEdges) {
      const sourceColumn = (await db("dataset_columns as c")
        .join("datasets as d", "d.id", "c.dataset_id")
        .where("c.id", edge.source_column_id)
        .select("c.*", "d.name as dataset_name")
        .first()) as Row | undefined;

      const sourceDatasetId = String(edge.source_dataset_id);

      if (sourceColumn) {
        nodes.set(String(sourceColumn.id), {
          id: String(sourceColumn.id),
          kind: "column",
          name: String(sourceColumn.name),
          datasetId: sourceDatasetId,
          dataType: sourceColumn.data_type ? String(sourceColumn.data_type) : null,
          transformKind: String(edge.transform_kind),
        });
      }

      nodes.set(String(edge.id), {
        id: String(edge.id),
        kind: "transform",
        name: String(edge.transform_kind),
        datasetId: null,
        dataType: null,
        transformKind: String(edge.transform_kind),
      });

      // Column -> transform, transform -> source column.
      edges.push({
        from: String(columnId),
        to: String(edge.id),
        transformKind: String(edge.transform_kind),
        transformOrder: Number(edge.transform_order),
      });
      // Reverse direction so source reference appears downstream-consistent.
      edges.push({
        from: String(edge.id),
        to: String(sourceColumn?.id ?? ""),
        transformKind: String(edge.transform_kind),
        transformOrder: Number(edge.transform_order),
      });
    }

    logger.info(
      {
        feature: "dataset_column_lineage",
        action: "lineage_view_generated",
        dataset_id: datasetId,
        column_id: columnId,
        node_count: nodes.size,
        edge_count: edges.length,
      },
      "Column lineage view generated"
    );

    return {
      datasetId,
      datasetName: String(column.dataset_name),
      columnId,
      columnName: String(column.name),
      nodes: Array.from(nodes.values()),
      edges: edges.filter((e) => e.to.length > 0),
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // MAPPERS
  // ---------------------------------------------------------------------------

  private mapDataset(row: Row): DatasetSummary {
    return {
      id: String(row.id),
      name: String(row.name),
      displayName: String(row.display_name),
      description: row.description ? String(row.description) : null,
      category: String(row.category),
      columnCount: Number(row.column_count ?? 0),
      isActive: Boolean(row.is_active),
    };
  }

  private mapColumn(row: Row): DatasetColumn {
    return {
      id: String(row.id),
      datasetId: String(row.dataset_id),
      name: String(row.name),
      dataType: row.data_type ? String(row.data_type) : null,
      description: row.description ? String(row.description) : null,
      isPrimaryKey: Boolean(row.is_primary_key),
      position: Number(row.position),
    };
  }
}

export const datasetColumnLineageService = new DatasetColumnLineageService();
