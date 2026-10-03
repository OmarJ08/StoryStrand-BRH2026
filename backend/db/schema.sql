CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vectorscale;

CREATE TABLE items (
  id text PRIMARY KEY, type text NOT NULL,
  map text NOT NULL CHECK (map IN ('books', 'knowledge')),
  slug text UNIQUE NOT NULL, title text NOT NULL, creators text[], year int,
  description text, tags text[], cover_url text, rating real,
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  attributes jsonb DEFAULT '{}',
  cluster_id int, cluster_label text, x real, y real, z real,
  embedding vector(1024) NOT NULL
);
CREATE INDEX items_embedding_idx ON items USING diskann (embedding vector_cosine_ops);
-- one partial DiskANN index per map: a filtered search ("knowledge items near this book")
-- through the shared index streams past thousands of books first (~800 ms vs ~2 ms)
CREATE INDEX items_embedding_knowledge_idx ON items USING diskann (embedding vector_cosine_ops) WHERE map = 'knowledge';
CREATE INDEX items_embedding_books_idx ON items USING diskann (embedding vector_cosine_ops) WHERE map = 'books';
CREATE INDEX items_map_idx ON items (map);

CREATE TABLE portals (
  book_id text REFERENCES items(id), knowledge_id text REFERENCES items(id),
  similarity real NOT NULL, PRIMARY KEY (book_id, knowledge_id)
);

CREATE TABLE book_concepts (   -- cache for "Learn the real science"
  book_id text REFERENCES items(id), concept text NOT NULL,
  knowledge_id text REFERENCES items(id), similarity real,
  created_at timestamptz DEFAULT now(), PRIMARY KEY (book_id, concept)
);

CREATE TABLE guests (
  guest_id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(),
  picks text[] NOT NULL, centroid vector(1024)
);

CREATE TABLE guest_positions (
  guest_id uuid REFERENCES guests(guest_id), map text NOT NULL,
  x real, y real, z real, home_cluster text, PRIMARY KEY (guest_id, map)
);

CREATE TABLE routes (
  route_id text PRIMARY KEY, created_at timestamptz DEFAULT now(), guest_id uuid,
  map text NOT NULL, kind text NOT NULL,   -- taste | learning | bridge | cross
  stops text[] NOT NULL, notes jsonb, postcard_url text,
  relaxed boolean DEFAULT false            -- (v6.1) true if strict climb rule had no path
);

CREATE TABLE events (
  time timestamptz NOT NULL, guest_id uuid, map text NOT NULL,
  kind text NOT NULL,   -- search | route | stop_click | portal_jump | learn | read
  item_id text, cluster_label text, route_id text, simulated boolean DEFAULT false
);
SELECT create_hypertable('events', by_range('time'));

-- (v6.1) materialized_only = false: real-time aggregation, so the newest events
-- show up immediately instead of waiting for the next refresh
CREATE MATERIALIZED VIEW neighborhood_traffic
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('5 minutes', time) AS bucket, map, cluster_label, count(*) AS visits
FROM events GROUP BY bucket, map, cluster_label;

SELECT add_continuous_aggregate_policy('neighborhood_traffic',
  start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
-- + compression/columnstore policy on events (check docs for current syntax)
