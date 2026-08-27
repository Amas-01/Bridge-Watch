import type { Knex } from "knex";

/**
 * Dead-letter investigation workspace.
 *
 * Attaches a case file to a dead-letter entry: lifecycle, assignee, notes, and
 * a recorded resolution. Without it, a decision to stop retrying a poison
 * message lives only in someone's memory, and the same entry gets re-examined
 * from scratch every time it resurfaces.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("dead_letter_investigations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("dead_letter_id", 128).notNullable();
    // open | investigating | awaiting_fix | resolved | discarded
    t.string("status", 24).notNullable().defaultTo("open");
    t.string("assignee", 128).nullable();
    // replayed | fixed_upstream | duplicate | not_reproducible | discarded
    t.string("resolution", 32).nullable();
    t.string("resolution_note", 2000).nullable();
    t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["status", "opened_at"], "idx_dl_investigation_queue");
    t.index(["assignee", "status"], "idx_dl_investigation_assignee");
    t.index(["dead_letter_id"], "idx_dl_investigation_entry");

    // A closed case must carry the decision that closed it, so a resolution
    // cannot be lost by an update that only moves the status.
    t.check(
      "(status NOT IN ('resolved','discarded')) OR (resolution IS NOT NULL AND closed_at IS NOT NULL)",
      [],
      "chk_dl_investigation_closed"
    );
  });

  // At most one live investigation per dead-letter entry. Two operators opening
  // the same case would otherwise produce competing conclusions on one entry.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_dl_investigation_open
      ON dead_letter_investigations (dead_letter_id)
      WHERE status NOT IN ('resolved', 'discarded')
  `);

  await knex.schema.createTable("dead_letter_investigation_notes", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("investigation_id").notNullable();
    t.string("actor", 128).notNullable();
    t.text("body").notNullable();
    // comment | transition
    t.string("kind", 16).notNullable().defaultTo("comment");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["investigation_id", "created_at"], "idx_dl_note_investigation");

    t.foreign("investigation_id")
      .references("dead_letter_investigations.id")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dead_letter_investigation_notes");
  await knex.raw("DROP INDEX IF EXISTS uq_dl_investigation_open");
  await knex.schema.dropTableIfExists("dead_letter_investigations");
}
