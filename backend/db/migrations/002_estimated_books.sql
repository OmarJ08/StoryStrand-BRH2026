-- Books a guest picked that aren't in the dataset: Open Library metadata + a qwen-written
-- blurb/tags, embedded with BGE-M3 and placed among their nearest real books.
-- Kept apart from items so the maps, routes and clustering only ever see real data.
CREATE TABLE IF NOT EXISTS estimated_books (
  id text PRIMARY KEY,                 -- "est:<slug>"
  title text NOT NULL,
  creators text[],
  year int,
  description text,
  tags text[],
  cover_url text,
  source_url text,                     -- Open Library work page, when found
  cluster_label text,
  x real, y real, z real,
  embedding vector(1024) NOT NULL,
  created_at timestamptz DEFAULT now()
);
