import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("causal_graph_nodes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("incident_id").notNullable().references("id").inTable("bridge_incidents").onDelete("CASCADE");
    // observation | derived_metric | alert | operator_action | contract_event | provider_failure
    table.string("node_type", 40).notNullable();
    // logical source table/kind for provenance, e.g. "alert_events", "bridge_transactions"
    table.string("entity_type", 80).nullable();
    // id of the source row this node was derived from, for provenance linking
    table.string("entity_id", 120).nullable();
    table.string("label", 255).notNullable();
    // when the underlying real-world event happened
    table.timestamp("occurred_at", { useTz: true }).notNullable();
    // when this node was recorded into the graph (may be well after occurred_at for late evidence)
    table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // confirmed | corrected | reverted
    table.string("confidence_state", 20).notNullable().defaultTo("confirmed");
    table.uuid("superseded_by_node_id").nullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.index(["incident_id", "occurred_at"], "idx_causal_nodes_incident_time");
    table.index(["incident_id", "node_type"], "idx_causal_nodes_incident_type");
    table.index(["incident_id", "entity_type", "entity_id"], "idx_causal_nodes_incident_entity");
    table.index(["confidence_state"], "idx_causal_nodes_confidence_state");
  });

  await knex.schema.createTable("causal_graph_edges", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("incident_id").notNullable().references("id").inTable("bridge_incidents").onDelete("CASCADE");
    table.uuid("from_node_id").notNullable().references("id").inTable("causal_graph_nodes").onDelete("CASCADE");
    table.uuid("to_node_id").notNullable().references("id").inTable("causal_graph_nodes").onDelete("CASCADE");
    // causes | contributes_to | correlates_with | precedes
    table.string("relation_type", 40).notNullable().defaultTo("causes");
    // direct_evidence | correlation | unknown
    table.string("confidence_class", 20).notNullable();
    table.double("confidence_score").notNullable();
    // name of the rule/algorithm that produced this edge, e.g. "explicit_provenance_reference"
    table.string("inference_rule", 120).notNullable();
    // array of { type, id, description } evidence references backing this edge
    table.jsonb("evidence").notNullable().defaultTo("[]");
    // { earliestAt, latestAt, windowSeconds } describing the temporal confidence interval
    table.jsonb("temporal_confidence").notNullable().defaultTo("{}");
    // active | reverted | superseded
    table.string("status", 20).notNullable().defaultTo("active");
    table.uuid("superseded_by_edge_id").nullable();
    table.string("revoked_reason", 255).nullable();
    table.string("created_by", 120).notNullable().defaultTo("system");
    table.timestamps(true, true);

    table.index(["incident_id", "status"], "idx_causal_edges_incident_status");
    table.index(["from_node_id"], "idx_causal_edges_from_node");
    table.index(["to_node_id"], "idx_causal_edges_to_node");
  });

  await knex.schema.createTable("causal_graph_revisions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("incident_id").notNullable().references("id").inTable("bridge_incidents").onDelete("CASCADE");
    table.uuid("node_id").nullable().references("id").inTable("causal_graph_nodes").onDelete("SET NULL");
    table.uuid("edge_id").nullable().references("id").inTable("causal_graph_edges").onDelete("SET NULL");
    // node_added | node_corrected | node_reverted | edge_added | edge_reverted | edge_superseded
    table.string("action", 40).notNullable();
    // late_evidence | reorg_correction | manual | inference
    table.string("reason", 60).nullable();
    table.string("actor", 120).notNullable().defaultTo("system");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["incident_id", "created_at"], "idx_causal_revisions_incident_time");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("causal_graph_revisions");
  await knex.schema.dropTableIfExists("causal_graph_edges");
  await knex.schema.dropTableIfExists("causal_graph_nodes");
}
