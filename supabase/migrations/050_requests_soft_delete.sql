-- Soft-delete for equipment requests: hide from Browse while preserving row, chats, and rental history.

alter table public.requests
  add column if not exists is_active boolean not null default true;

alter table public.requests
  add column if not exists deleted_at timestamptz;

comment on column public.requests.is_active is 'When false, request is withdrawn from Browse; row retained for audit and linked offers/chats.';
comment on column public.requests.deleted_at is 'Set when the requester deactivates the request.';

update public.requests
set is_active = true
where is_active is null;

update public.requests
set deleted_at = null
where is_active = true and deleted_at is not null;

create index if not exists requests_is_active_created_idx
  on public.requests (is_active, created_at desc);

-- Close open negotiation threads when the request is deactivated (preserve accepted / pending_confirmation).
create or replace function public.close_offers_when_request_deactivated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active is distinct from old.is_active and new.is_active = false then
    update public.offers o
    set
      status = 'closed',
      negotiation_locked = true,
      updated_at = now()
    where o.request_id = new.id
      and o.status not in ('accepted', 'pending_confirmation');
  end if;
  return new;
end;
$$;

drop trigger if exists requests_soft_delete_close_offers on public.requests;
create trigger requests_soft_delete_close_offers
  after update of is_active on public.requests
  for each row
  execute function public.close_offers_when_request_deactivated();
