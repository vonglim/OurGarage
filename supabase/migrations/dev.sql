-- PROFILES
create table profiles (
  id uuid primary key references auth.users(id),
  name text,
  created_at timestamptz default now()
);

-- REQUESTS
create table requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text,
  price numeric,
  created_at timestamptz default now()
);

-- OFFERS
create table offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  user_id uuid,
  amount numeric,
  created_at timestamptz default now()
);

-- OFFER MESSAGES
create table offer_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz default now()
);

-- RENTALS
create table rentals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  offer_id uuid,
  created_at timestamptz default now()
);

-- NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text,
  title text,
  body text,
  data jsonb,
  read boolean default false,
  request_id uuid,
  offer_id uuid,
  created_at timestamptz default now()
);