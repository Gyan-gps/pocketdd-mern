# MongoDB schema

The API stores everything in MongoDB (`MONGODB_URI`, database `MONGODB_DB`, default `pocketdd`).
Data is copied from the old Laravel MySQL database with `scripts/migrate-from-mysql.ts`, which can be re-run.

## Conventions
- **`_id` is the old integer id.** New ids come from the `counters` collection (`nextId()` / `insertRow()` in
  `src/db/mongo.ts`), seeded from MySQL `AUTO_INCREMENT`, so ids stay numeric and continue where MySQL stopped.
  The mobile app and URLs keep working.
- **Documents keep the MySQL row shape:** same field names, field order and value types. Dates and timestamps
  are IST strings (`"2025-06-19 10:30:00"`), DATE is `"2025-06-19"`, DECIMAL is a string (`"10.00"`),
  tinyint/int are numbers, NULL stays `null`. `toRow(doc)` turns `_id` back into `id` in the first position,
  so JSON responses are identical to the Laravel ones.
- **JSON-in-text columns are stored as native values** (arrays and objects). A value that was not valid JSON
  is kept as the stored string. Code that used to `JSON.parse` the column now gets the value directly.
  Where an API response used to return the raw JSON string, re-encode with `phpJsonEncode()`.
- **Child tables are embedded** in their parent as arrays. Each child keeps its own `id` (counter key
  `<collection>.<field>`) and its columns, minus the parent foreign key.
- **Deletes no longer cascade on their own.** MySQL foreign keys used `ON DELETE CASCADE`; the code must
  do the same (see "Cascades").
- Comparisons: MySQL compared strings case-insensitively. Use `like()` (case-insensitive regex) for
  `LIKE`, and a collation `{ locale: 'en', strength: 2 }` when an exact case-insensitive match matters.

## Collections

| Collection | Was (MySQL) | Embedded arrays | JSON fields (native) |
|---|---|---|---|
| `users` | users | | |
| `personal_access_tokens` | personal_access_tokens | | `abilities` |
| `businesses` | businesses | `details[]` ← business_details, `images[]` ← business_iamges, `locations[]` ← business_locations, `owners[]` ← business_owners | `social_media_url` |
| `business_categories` | business_categories | | |
| `business_sub_categories` | business_sub_categories | | |
| `business_users` | business_users | `locations[]` ← business_users_location | |
| `business_requests` | businesse_requests | | |
| `locations` | locations | | |
| `pincodes` | pincodes | | |
| `addresses` | addresses | | `area`, `area_hi` |
| `advertisements` | advertisments | `subcategories[]` ← advertisment_subcategory | `sub_category_name` |
| `ad_user_views` | ad_user_views | | |
| `events` | events | `details[]` ← event_details, `locations[]` ← event_locations | |
| `departments` | departments | | `designation_id`, `department_mobile_number` |
| `designations` | designations | | |
| `administrators` | administrators | | |
| `city_helpline_numbers` | city_helpline_numbers | | `city_helpline` |
| `about_uses` | about_uses | | `tourist_places` |
| `sliders` | sliders | | |
| `user_notifications` | user_notifications | | `data` |
| `device_ids` | device_ids | | |
| `otp_verifications` | otp_verifications | | |
| `api_failures` | api_failures | | |
| `jobs` | node_jobs | | `args` |
| `language_lines` | language_lines | | `text` |
| `app_versions` | app_versions | | |
| `counters` | (AUTO_INCREMENT) | | |

Not migrated: Laravel framework tables (`cache`, `sessions`, `jobs`, `failed_jobs`, `job_batches`,
`migrations`, `password_reset_tokens`, `revisions`, `media`, `articles`, `tags`, `pages`, `settings`,
`menu_items`, `permissions`/`roles`, `activity_log`, `pan_analytics`, `stats_events`, `import_log`).

### Example: a business
```json
{
  "_id": 901,
  "user_id": 12, "business_category_id": 3, "business_sub_category_id": 7,
  "name": "Sharma Electricals", "slug": "sharma-electricals", "status": 1,
  "social_media_url": [{ "platform": "fb", "url": "https://fb.com/x" }],
  "created_at": "2025-06-19 10:30:00", "updated_at": "2025-06-19 10:30:00",
  "details":   [{ "id": 4, "street_address": "...", "pincode_id": 15, "created_at": "...", "updated_at": "..." }],
  "images":    [{ "id": 9, "img": "uploads/business/a.jpg", "created_at": "...", "updated_at": "..." }],
  "locations": [{ "id": 2, "location_id": 5, "created_at": "...", "updated_at": "..." }],
  "owners":    [{ "id": 1, "name": "...", "phone": "...", "user_id": 12, "created_at": "...", "updated_at": "..." }]
}
```

## Cascades (old `ON DELETE CASCADE` foreign keys)
- Deleting a **business** removes its details, images, location links and owners (embedded, automatic), and
  its `business_requests` rows.
- Deleting a **location** must `$pull` it from `businesses.locations`, `events.locations` and
  `business_users.locations`, and delete its `city_helpline_numbers`.
- Deleting a **business category** deletes its sub-categories and the businesses in it.
- Deleting a **business sub-category** deletes the businesses in it.
- Deleting a **user** deletes their businesses, business_users and user_notifications.
- Deleting an **event** removes its details and location links (embedded, automatic).

## Geo search (ready, not used yet)
`businesses` has a sparse `2dsphere` index on `geo`. To add "near me" search, store
`geo: { type: "Point", coordinates: [lng, lat] }` on each business and query with `$geoNear`.

## Indexes
Defined in `src/db/indexes.ts` (`ensureIndexes()`), created by the migration script.
