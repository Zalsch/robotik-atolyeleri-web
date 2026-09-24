-- Durable, server-only delivery queues. PostgreSQL remains the source of truth.
create table public.attendance_sync_outbox (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.app_users(id),
  change_version bigint not null default 1,
  changed_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  synced_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_until timestamptz,
  primary key (lesson_id, student_id)
);
create index attendance_sync_due_idx on public.attendance_sync_outbox (next_attempt_at, changed_at)
  where synced_at is null;

create function public.queue_attendance_sync() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.attendance_sync_outbox (lesson_id, student_id)
    values (new.lesson_id, new.student_id)
    on conflict (lesson_id, student_id) do update set
      change_version = public.attendance_sync_outbox.change_version + 1,
      changed_at = now(), attempts = 0, next_attempt_at = now(), synced_at = null,
      last_error = null, lease_token = null, lease_until = null;
  return new;
end;
$$;
create trigger attendance_sync_enqueue after insert or update of status on public.attendance
  for each row execute function public.queue_attendance_sync();
-- Existing attendance must also be exported when a Sheet is connected later.
insert into public.attendance_sync_outbox (lesson_id, student_id)
  select lesson_id, student_id from public.attendance
  on conflict (lesson_id, student_id) do nothing;

create table app_private.delivery_locks (
  name text primary key,
  token uuid not null,
  locked_until timestamptz not null
);
alter table app_private.delivery_locks enable row level security;
revoke all on app_private.delivery_locks from public, anon, authenticated;
grant select, insert, update, delete on app_private.delivery_locks to service_role;

create function public.acquire_delivery_lock(p_name text, p_seconds integer) returns uuid
language plpgsql set search_path = '' as $$
declare v_token uuid := gen_random_uuid();
begin
  if p_name not in ('attendance', 'push') or p_seconds not between 5 and 600 then
    raise exception 'invalid delivery lock';
  end if;
  insert into app_private.delivery_locks (name, token, locked_until)
    values (p_name, v_token, now() + make_interval(secs => p_seconds))
    on conflict (name) do update set token = excluded.token, locked_until = excluded.locked_until
      where app_private.delivery_locks.locked_until < now()
    returning token into v_token;
  return v_token;
end;
$$;
create function public.release_delivery_lock(p_name text, p_token uuid) returns void
language plpgsql set search_path = '' as $$
begin
  delete from app_private.delivery_locks where name = p_name and token = p_token;
end;
$$;

create function public.claim_attendance_sync(p_limit integer)
returns table(lesson_id uuid, student_id uuid, change_version bigint, lease_token uuid,
  class_id uuid, class_name text, lesson_at timestamptz, student_name text, status text, updated_at timestamptz)
language plpgsql set search_path = '' as $$
begin
  return query
    with picked as (
      select o.lesson_id, o.student_id from public.attendance_sync_outbox o
        where o.synced_at is null and o.next_attempt_at <= now()
          and (o.lease_until is null or o.lease_until < now())
        order by o.next_attempt_at, o.changed_at
        for update skip locked limit least(greatest(p_limit, 1), 100)
    ), leased as (
      update public.attendance_sync_outbox o
        set lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
        from picked p where o.lesson_id = p.lesson_id and o.student_id = p.student_id
        returning o.lesson_id, o.student_id, o.change_version, o.lease_token
    )
    select l.lesson_id, l.student_id, l.change_version, l.lease_token,
      lesson.class_id, c.name, coalesce(lesson.actual_at, lesson.scheduled_at),
      student.display_name, a.status, a.updated_at
      from leased l
      join public.attendance a on a.lesson_id = l.lesson_id and a.student_id = l.student_id
      join public.lessons lesson on lesson.id = l.lesson_id
      join public.classes c on c.id = lesson.class_id
      join public.app_users student on student.id = l.student_id;
end;
$$;

create function public.finish_attendance_sync(
  p_lesson_id uuid, p_student_id uuid, p_change_version bigint, p_lease_token uuid,
  p_success boolean, p_error text default null
) returns boolean language plpgsql set search_path = '' as $$
begin
  update public.attendance_sync_outbox o set
    synced_at = case when p_success then now() else null end,
    attempts = case when p_success then o.attempts else o.attempts + 1 end,
    next_attempt_at = case when p_success then o.next_attempt_at
      else now() + make_interval(secs => least(21600, (60 * power(2, least(o.attempts, 8)))::integer)) end,
    last_error = case when p_success then null else left(coalesce(p_error, 'delivery failed'), 400) end,
    lease_token = null, lease_until = null
    where o.lesson_id = p_lesson_id and o.student_id = p_student_id
      and o.change_version = p_change_version and o.lease_token = p_lease_token;
  return found;
end;
$$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.app_users(id),
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (length(p256dh) between 20 and 300),
  auth text not null check (length(auth) between 10 and 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_student_idx on public.push_subscriptions (student_id) where active;

create table public.push_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  student_id uuid not null references public.app_users(id),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  discarded_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_until timestamptz,
  unique (announcement_id, subscription_id)
);
create index push_delivery_due_idx on public.push_delivery_outbox (next_attempt_at, id)
  where sent_at is null and discarded_at is null;

create function public.queue_announcement_push() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.push_delivery_outbox (announcement_id, subscription_id, student_id)
    select new.id, sub.id, sub.student_id from public.push_subscriptions sub
      join public.app_users u on u.id = sub.student_id and u.role = 'student' and u.active
      where sub.active and exists (
        select 1 from public.enrollments e where e.class_id = new.class_id
          and e.student_id = sub.student_id and e.left_at is null
      )
    on conflict (announcement_id, subscription_id) do nothing;
  return new;
end;
$$;
create trigger announcement_push_enqueue after insert on public.announcements
  for each row execute function public.queue_announcement_push();

create function public.claim_push_delivery(p_limit integer)
returns table(id uuid, lease_token uuid, endpoint text, p256dh text, auth text,
  title text, body text, class_id uuid, eligible boolean)
language plpgsql set search_path = '' as $$
begin
  return query
    with picked as (
      select o.id from public.push_delivery_outbox o
        where o.sent_at is null and o.discarded_at is null and o.next_attempt_at <= now()
          and (o.lease_until is null or o.lease_until < now())
        order by o.next_attempt_at, o.id
        for update skip locked limit least(greatest(p_limit, 1), 100)
    ), leased as (
      update public.push_delivery_outbox o
        set lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
        from picked p where o.id = p.id
        returning o.id, o.lease_token, o.subscription_id, o.student_id, o.announcement_id
    )
    select l.id, l.lease_token, sub.endpoint, sub.p256dh, sub.auth,
      a.title, a.body, a.class_id,
      (sub.active and sub.student_id = l.student_id and u.active and u.role = 'student'
        and c.active and exists (select 1 from public.enrollments e where e.class_id = a.class_id
          and e.student_id = l.student_id and e.left_at is null))
      from leased l
      join public.push_subscriptions sub on sub.id = l.subscription_id
      join public.announcements a on a.id = l.announcement_id
      join public.classes c on c.id = a.class_id
      join public.app_users u on u.id = l.student_id;
end;
$$;

create function public.finish_push_delivery(
  p_id uuid, p_lease_token uuid, p_result text, p_error text default null
) returns boolean language plpgsql set search_path = '' as $$
begin
  if p_result not in ('sent', 'retry', 'discard') then raise exception 'invalid delivery result'; end if;
  update public.push_delivery_outbox o set
    sent_at = case when p_result = 'sent' then now() else null end,
    discarded_at = case when p_result = 'discard' then now() else null end,
    attempts = o.attempts + 1,
    next_attempt_at = case when p_result = 'retry'
      then now() + make_interval(secs => least(21600, (60 * power(2, least(o.attempts, 8)))::integer))
      else o.next_attempt_at end,
    last_error = case when p_result = 'sent' then null else left(coalesce(p_error, p_result), 400) end,
    lease_token = null, lease_until = null
    where o.id = p_id and o.lease_token = p_lease_token;
  return found;
end;
$$;

alter table public.attendance_sync_outbox enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_outbox enable row level security;
revoke all on public.attendance_sync_outbox, public.push_subscriptions, public.push_delivery_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.attendance_sync_outbox, public.push_subscriptions, public.push_delivery_outbox to service_role;
revoke all on function public.queue_attendance_sync() from public, anon, authenticated;
revoke all on function public.acquire_delivery_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_delivery_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.claim_attendance_sync(integer) from public, anon, authenticated;
revoke all on function public.finish_attendance_sync(uuid, uuid, bigint, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.queue_announcement_push() from public, anon, authenticated;
revoke all on function public.claim_push_delivery(integer) from public, anon, authenticated;
revoke all on function public.finish_push_delivery(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.acquire_delivery_lock(text, integer) to service_role;
grant execute on function public.release_delivery_lock(text, uuid) to service_role;
grant execute on function public.claim_attendance_sync(integer) to service_role;
grant execute on function public.finish_attendance_sync(uuid, uuid, bigint, uuid, boolean, text) to service_role;
grant execute on function public.claim_push_delivery(integer) to service_role;
grant execute on function public.finish_push_delivery(uuid, uuid, text, text) to service_role;
