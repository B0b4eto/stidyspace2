-- SQL schema for Study Space minimal auth

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- You can add tables for sessions, user_preferences, blocks, etc.

CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  -- `user_id` stored as TEXT to support both integer user ids (local DB)
  -- and Supabase UUID auth user ids.
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Example preferences storage for customization (blocks, positions, colors)
CREATE TABLE IF NOT EXISTS user_blocks (
  id SERIAL PRIMARY KEY,
  -- store `user_id` as TEXT to allow Supabase UUIDs or local integer ids
  user_id TEXT NOT NULL,
  block_key TEXT NOT NULL,
  position JSONB, -- {x,y,width,height} or grid placement
  style JSONB, -- {backgroundColor, color, borderRadius, customCss}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Per-user flashcards storage. `id` is a client-generated string/uuid.
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  front TEXT,
  back TEXT,
  tags TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
