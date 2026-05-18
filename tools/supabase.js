create or replace function public.search_memories(search_query text)
returns table (
  id bigint,
  chat_id text,
  task text,
  result text,
  created_at timestamptz
)
language sql
stable
as $$
  select m.id, m.chat_id, m.task, m.result, m.created_at
  from public.memories m
  where to_tsvector('simple', coalesce(m.task,'') || ' ' || coalesce(m.result,''))
        @@ plainto_tsquery('simple', search_query)
  order by m.created_at desc
  limit 5;
$$;
