-- DRAFT ONLY. DO NOT RUN.
-- Review these statements before any CREATE. Nexus Pathways will not execute them.
-- Run at most one statement at a time, and only after an explicit go-ahead.
-- Do not point these tables at NY_TAXI or TPCDS.
--
-- File-table syntax checked against the installed driver image
-- zetarishackathon.azurecr.io/zetaris-ndp-driver:2.4.3-v2.4.3.1-hackathon
-- and its seed file /home/zetaris/zetaris-ndp-driver/bin/seed-org.sql.
-- That seed uses:
--   CREATE LIGHTNING DATABASE <name> DESCRIBE BY "<description>" OPTIONS ();
--   CREATE LIGHTNING FILESTORE TABLE <table> FROM <database>
--   FORMAT csv
--   OPTIONS (
--     path "<path>",
--     header "true"
--   );
-- The seed's S3 option isS3BucketPublic is only for the public sample bucket.
-- These local CSV files omit it. The seed does not set inferSchema.
--
-- Path checked inside container zetaris-driver-1, without creating anything:
--   ZETARIS_LOCAL_FILE_SYTEM_ROOT_PATH=/home/zetaris/customer-data/shared
--   FILESYSTEM_STAGING=/home/zetaris/customer-data
--   NDP_ROOT_PATH=/home/zetaris/customer-data
-- /home/zetaris/customer-data/shared exists and was empty.
-- /home/zetaris/customer-data/nexus-pathways does not exist.
-- The files below are not in the container. Copy them only after this draft
-- is approved. Do not copy learner scans, and do not add private or class rows.
--
-- Repo files:
--   data/zetaris/requirements.csv
--   data/zetaris/resources.csv
--   data/zetaris/sources.csv
--   data/zetaris/passages.csv
-- Proposed driver path, under the verified local root:
--   /home/zetaris/customer-data/shared/nexus-pathways/
-- DESCRIBE BY allows letters, digits, spaces, underscore, period, hyphen, and comma.
--
-- passages.csv is public-only. Every row is section 7.5 body text from
-- https://pressbooks.bccampus.ca/technicalwriting2ed/chapter/progressreports/
-- Listed book exceptions, including figure 7.4.3, are not in the file.
-- lessoncraft_competency_ids is a LessonCraft mapping, not the authors' framework.
--
-- A pathway run has not retrieved these passages from Zetaris. NEXUS_PATHWAYS
-- is not registered, so the app keeps the labeled local fixture.

CREATE LIGHTNING DATABASE NEXUS_PATHWAYS DESCRIBE BY "Nexus Pathways workplace records and reviewed public passages" OPTIONS ();

CREATE LIGHTNING FILESTORE TABLE requirements FROM NEXUS_PATHWAYS
FORMAT csv
OPTIONS (
  path "/home/zetaris/customer-data/shared/nexus-pathways/requirements.csv",
  header "true"
);

CREATE LIGHTNING FILESTORE TABLE resources FROM NEXUS_PATHWAYS
FORMAT csv
OPTIONS (
  path "/home/zetaris/customer-data/shared/nexus-pathways/resources.csv",
  header "true"
);

CREATE LIGHTNING FILESTORE TABLE sources FROM NEXUS_PATHWAYS
FORMAT csv
OPTIONS (
  path "/home/zetaris/customer-data/shared/nexus-pathways/sources.csv",
  header "true"
);

CREATE LIGHTNING FILESTORE TABLE passages FROM NEXUS_PATHWAYS
FORMAT csv
OPTIONS (
  path "/home/zetaris/customer-data/shared/nexus-pathways/passages.csv",
  header "true"
);

-- Read-only checks after the tables exist. Still one statement per call.
-- Do not run the passage query until CREATE has been approved and the CSV
-- is on the verified path. Until then, a run uses the local fixture.
-- SHOW LIGHTNING DATABASES
-- SHOW LIGHTNING TABLES NEXUS_PATHWAYS
-- SELECT * FROM NEXUS_PATHWAYS.requirements LIMIT 100
-- SELECT * FROM NEXUS_PATHWAYS.resources LIMIT 100
-- SELECT * FROM NEXUS_PATHWAYS.sources LIMIT 100
--
-- Passage query for the app trace. One statement. It returns the passage
-- text, the LessonCraft mapping, and the citation and access fields.
-- SELECT passage_id, passage_text, section_locator, lessoncraft_competency_ids, lessoncraft_mapping_note, source_id, source_title, creators, editor, source_url, licence, licence_url, attribution, review_status, not_official_standard, official_standard_marker, access_scope, share_status, content_origin, training_use, language_code FROM NEXUS_PATHWAYS.passages WHERE access_scope = 'approved_public' AND share_status = 'published' AND training_use = 'retrieval_only' AND content_origin = 'approved public resource' LIMIT 20
