-- Unified rentals: semantic parties (borrower vs equipment owner), optional listing/rental_request links.

alter table public.rentals add column if not exists renter_user_id uuid;
alter table public.rentals add column if not exists owner_user_id uuid;

update public.rentals set
  renter_user_id = owner_id::uuid,
  owner_user_id = renter_id::uuid
where renter_user_id is null;

alter table public.rentals alter column renter_user_id set not null;
alter table public.rentals alter column owner_user_id set not null;

alter table public.rentals drop constraint if exists rentals_owner_id_profiles_fkey;
alter table public.rentals drop constraint if exists rentals_renter_id_profiles_fkey;
alter table public.rentals drop column if exists owner_id;
alter table public.rentals drop column if exists renter_id;

alter table public.rentals add constraint rentals_renter_user_id_profiles_fkey
  foreign key (renter_user_id) references public.profiles (id) on update cascade on delete cascade;
alter table public.rentals add constraint rentals_owner_user_id_profiles_fkey
  foreign key (owner_user_id) references public.profiles (id) on update cascade on delete cascade;

alter table public.rentals alter column request_id drop not null;
alter table public.rentals alter column offer_id drop not null;

alter table public.rentals add column if not exists listing_id uuid references public.listings (id) on delete cascade;
alter table public.rentals add column if not exists rental_request_id uuid references public.rental_requests (id) on delete set null;

create unique index if not exists rentals_rental_request_id_key on public.rentals (rental_request_id)
  where rental_request_id is not null;

-- When a listing rental_request is approved, mirror into rentals (single Activity source).
create or replace function public.insert_rental_when_rental_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  equip_owner uuid;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'approved' then
    return new;
  end if;

  if exists (select 1 from public.rentals r where r.rental_request_id = new.id) then
    return new;
  end if;

  select l.user_id into equip_owner from public.listings l where l.id = new.listing_id;
  equip_owner := coalesce(new.owner_user_id, equip_owner);
  if equip_owner is null then
    raise warning 'rental_requests approve: missing listing owner for listing_id %', new.listing_id;
    return new;
  end if;

  insert into public.rentals (
    renter_user_id,
    owner_user_id,
    price,
    status,
    listing_id,
    rental_request_id,
    request_id,
    offer_id
  ) values (
    new.renter_user_id,
    equip_owner,
    new.price,
    'active',
    new.listing_id,
    new.id,
    null,
    null
  );

  return new;
end;
$$;

drop trigger if exists rental_requests_approved_insert_rental_ins on public.rental_requests;
create trigger rental_requests_approved_insert_rental_ins
  after insert on public.rental_requests
  for each row
  when (new.status = 'approved')
  execute function public.insert_rental_when_rental_request_approved();

drop trigger if exists rental_requests_approved_insert_rental_upd on public.rental_requests;
create trigger rental_requests_approved_insert_rental_upd
  after update of status on public.rental_requests
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.insert_rental_when_rental_request_approved();

comment on column public.rentals.renter_user_id is 'Borrower (person renting/using the equipment).';
comment on column public.rentals.owner_user_id is 'Equipment owner (person renting out).';
