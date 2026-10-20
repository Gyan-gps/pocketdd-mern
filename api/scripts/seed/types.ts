/** [table, rows] pairs. Rows are upserted by primary key, so seeding is repeatable. */
export type Seed = Array<[string, Array<Record<string, unknown>>]>;
