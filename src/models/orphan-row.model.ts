// Child-table rows whose parent did not exist during the MySQL migration (`{ table, row }`).
// They are still editable from the admin panel, so updates keep reaching them (db/eloquent.ts updateRowById()).
import { Schema, model } from 'mongoose';

export const orphanRowSchema = new Schema(
  {
    table: { type: String },
    row: { type: Schema.Types.Mixed },
  },
  { collection: '_orphans', versionKey: false, timestamps: false, strict: false, minimize: false, autoIndex: false, autoCreate: false },
);

export const OrphanRow = model('OrphanRow', orphanRowSchema);
