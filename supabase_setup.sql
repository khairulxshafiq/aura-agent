-- AURA v3.0 Supabase Database Setup
-- Run this in Supabase SQL Editor

CREATE TABLE aura_memory (
  id BIGSERIAL PRIMARY KEY,
  task TEXT,
  understanding TEXT,
  plan JSONB,
  results JSONB,
  review TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE aura_memory ADD COLUMN task_search TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(task, ''))) STORED;
CREATE INDEX idx_memory_search ON aura_memory USING GIN(task_search);

CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  customer TEXT,
  content TEXT,
  amount DECIMAL(10,2),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id BIGSERIAL PRIMARY KEY,
  category TEXT,
  amount DECIMAL(10,2),
  description TEXT,
  business TEXT,
  date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crm_leads (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT,
  product_interest TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMPTZ,
  activities JSONB,
  notes TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  description TEXT,
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sop_documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  content TEXT,
  department TEXT,
  version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  temp FLOAT,
  ph FLOAT,
  dissolved_oxygen FLOAT,
  ammonia FLOAT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE feeding_log (
  id BIGSERIAL PRIMARY KEY,
  time TIMESTAMPTZ,
  amount TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
