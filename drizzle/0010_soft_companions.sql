-- Personas became household companions rather than human characters, so stored
-- appearance moves from skin/hair/outfit choices to species/palette/pattern.
-- Data-only, forward-only, and guarded so it can never touch a row that has
-- already been converted. Outfit colour carries over to the companion palette
-- where it maps cleanly; everything else takes the default starting look.
UPDATE `personas`
SET
  `appearance_json` = json_object(
    'species', 'marshmallow',
    'palette', CASE json_extract(`appearance_json`, '$.outfit')
      WHEN 'mint' THEN 'mint'
      WHEN 'berry' THEN 'blush'
      WHEN 'sun' THEN 'butter'
      ELSE 'cream'
    END,
    'pattern', 'plain',
    'accessory', CASE json_extract(`appearance_json`, '$.accent')
      WHEN 'glasses' THEN 'glasses'
      ELSE 'none'
    END
  ),
  `base_style_version` = 'homebase-companion-v1',
  `updated_at` = CURRENT_TIMESTAMP
WHERE json_valid(`appearance_json`)
  AND json_extract(`appearance_json`, '$.species') IS NULL;
