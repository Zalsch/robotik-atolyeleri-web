-- Existing device registrations must opt in again after this migration.
-- A password or active-state change bumps app_users.session_version.
alter table public.push_subscriptions
  add column session_version integer not null default 0 check (session_version >= 0);

create or replace function public.queue_announcement_push() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.push_delivery_outbox (announcement_id, subscription_id, student_id)
    select new.id, sub.id, sub.student_id from public.push_subscriptions sub
      join public.app_users u on u.id = sub.student_id and u.role = 'student' and u.active
      where sub.active and sub.session_version = u.session_version and exists (
        select 1 from public.enrollments e where e.class_id = new.class_id
          and e.student_id = sub.student_id and e.left_at is null
      )
    on conflict (announcement_id, subscription_id) do nothing;
  return new;
end;
$$;

create or replace function public.claim_push_delivery(p_limit integer)
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
      (sub.active and sub.student_id = l.student_id and sub.session_version = u.session_version
        and u.active and u.role = 'student'
        and c.active and exists (select 1 from public.enrollments e where e.class_id = a.class_id
          and e.student_id = l.student_id and e.left_at is null))
      from leased l
      join public.push_subscriptions sub on sub.id = l.subscription_id
      join public.announcements a on a.id = l.announcement_id
      join public.classes c on c.id = a.class_id
      join public.app_users u on u.id = l.student_id;
end;
$$;
