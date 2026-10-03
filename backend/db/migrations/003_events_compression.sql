-- Columnar compression on the events hypertable (Section 8): segment by map, newest first.
-- Hourly chunks; chunks older than an hour are compressed by the policy. Inserts into a
-- compressed chunk still work (TimescaleDB 2.11+), so the chunk in use was compressed by hand
-- once with: SELECT compress_chunk(c, if_not_compressed => true) FROM show_chunks('events') c;
ALTER TABLE events SET (timescaledb.compress, timescaledb.compress_segmentby = 'map',
                        timescaledb.compress_orderby = 'time DESC');
SELECT add_compression_policy('events', compress_after => INTERVAL '1 hour', if_not_exists => true);
SELECT set_chunk_time_interval('events', INTERVAL '1 hour');
