-- Companion appearance collapses from four independent axes to one roster
-- character (see docs/DECISIONS.md, D-001). Species picks the closest character
-- so nobody's companion changes animal; palette only breaks the tie where the
-- roster carries two of the same body.
-- Data-only, forward-only, and guarded so a converted row is never touched.
UPDATE `personas`
SET
  `appearance_json` = json_object(
    'character', CASE json_extract(`appearance_json`, '$.species')
      WHEN 'bunny' THEN CASE json_extract(`appearance_json`, '$.palette')
        WHEN 'mint' THEN 'moss-bunny'
        WHEN 'sky' THEN 'moss-bunny'
        ELSE 'bunny'
      END
      WHEN 'cat' THEN CASE json_extract(`appearance_json`, '$.palette')
        WHEN 'sky' THEN 'dusk-cat'
        WHEN 'lilac' THEN 'dusk-cat'
        ELSE 'cat'
      END
      WHEN 'dog' THEN 'pup'
      WHEN 'bear' THEN 'bear'
      WHEN 'chick' THEN 'chick'
      ELSE 'marshmallow'
    END
  ),
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_valid(`appearance_json`)
  AND json_extract(`appearance_json`, '$.character') IS NULL;
--> statement-breakpoint
-- Repair: the companion migration stamped `updated_at` with SQLite's
-- CURRENT_TIMESTAMP, which is space-separated and fails the contract's
-- ISO-8601 check, so reading an affected persona returned a 500. Forward-only
-- correction for any row it touched.
UPDATE `personas`
SET `updated_at` = replace(`updated_at`, ' ', 'T') || '.000Z'
WHERE `updated_at` NOT LIKE '%T%';
--> statement-breakpoint
UPDATE `personas`
SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z'
WHERE `created_at` NOT LIKE '%T%';
