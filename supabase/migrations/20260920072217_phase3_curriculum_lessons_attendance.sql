-- Phase 3 extends the existing account/class schema without rewriting records.
-- All access remains server-only through service_role.
create table public.curricula (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 120),
  active boolean not null default true,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index curricula_title_unique on public.curricula (lower(title));

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id),
  title text not null check (length(trim(title)) between 2 and 120),
  position integer not null check (position > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (curriculum_id, position)
);
create index topics_curriculum_active_idx on public.topics (curriculum_id, position) where active;

alter table public.classes
  add column curriculum_id uuid references public.curricula(id),
  add column weekday smallint check (weekday between 1 and 7),
  add column start_time time without time zone,
  add column duration_minutes smallint check (duration_minutes between 30 and 480),
  add column schedule_effective_on date,
  add constraint classes_schedule_complete check (
    (weekday is null and start_time is null and duration_minutes is null and schedule_effective_on is null)
    or (weekday is not null and start_time is not null and duration_minutes is not null and schedule_effective_on is not null)
  );
create index classes_curriculum_idx on public.classes (curriculum_id);

create table public.topic_completions (
  student_id uuid not null references public.app_users(id),
  topic_id uuid not null references public.topics(id),
  class_id uuid not null references public.classes(id),
  marked_by uuid not null references public.app_users(id),
  completed_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);
create index topic_completions_topic_idx on public.topic_completions (topic_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  scheduled_on date not null,
  scheduled_at timestamptz not null,
  actual_at timestamptz,
  duration_minutes smallint not null check (duration_minutes between 30 and 480),
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  attendance_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, scheduled_on),
  check (status <> 'cancelled' or attendance_completed_at is null)
);
create index lessons_class_date_idx on public.lessons (class_id, scheduled_at);

create table public.attendance (
  lesson_id uuid not null references public.lessons(id),
  student_id uuid not null references public.app_users(id),
  status text not null check (status in ('var', 'yok')),
  marked_by uuid not null references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
create index attendance_student_idx on public.attendance (student_id, lesson_id);

alter table public.curricula enable row level security;
alter table public.topics enable row level security;
alter table public.topic_completions enable row level security;
alter table public.lessons enable row level security;
alter table public.attendance enable row level security;
revoke all on public.curricula, public.topics, public.topic_completions, public.lessons, public.attendance from public, anon, authenticated;
grant select, insert, update, delete on public.curricula, public.topics, public.topic_completions, public.lessons, public.attendance to service_role;

-- ISO weekdays: 1 Monday ... 7 Sunday. Local course times use Europe/Istanbul.
create function public.ensure_class_lessons(p_class_id uuid, p_through date)
returns void language plpgsql set search_path = '' as $$
declare
  v_class public.classes;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_day date;
begin
  select * into v_class from public.classes where id = p_class_id and active;
  if not found then raise exception 'class not found'; end if;
  if v_class.weekday is null then return; end if;
  if p_through is null or p_through > v_today + 366 then raise exception 'lesson horizon is too long'; end if;
  for v_day in select gs::date from generate_series(
    greatest(v_today, v_class.schedule_effective_on)::timestamp,
    p_through::timestamp, interval '1 day') as gs
  loop
    if extract(isodow from v_day) = v_class.weekday then
      insert into public.lessons(class_id, scheduled_on, scheduled_at, duration_minutes)
        values (p_class_id, v_day, (v_day + v_class.start_time) at time zone 'Europe/Istanbul', v_class.duration_minutes)
        on conflict (class_id, scheduled_on) do nothing;
    end if;
  end loop;
end;
$$;

create function public.set_class_learning_plan(
  p_teacher_id uuid, p_class_id uuid, p_curriculum_id uuid,
  p_weekday smallint, p_start_time time without time zone, p_duration_minutes smallint
) returns void language plpgsql set search_path = '' as $$
declare
  v_class public.classes;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_schedule_changed boolean;
begin
  select c.* into v_class from public.classes c
    join public.class_teachers ct on ct.class_id = c.id
    join public.app_users u on u.id = ct.teacher_id
    where c.id = p_class_id and c.active and ct.teacher_id = p_teacher_id
      and u.role = 'teacher' and u.active for update of c;
  if not found then raise exception 'teacher is not assigned to active class'; end if;
  if p_curriculum_id is not null and not exists (
    select 1 from public.curricula where id = p_curriculum_id and active
  ) then raise exception 'curriculum not found'; end if;
  if (p_weekday is null) <> (p_start_time is null)
     or (p_weekday is null) <> (p_duration_minutes is null) then
    raise exception 'complete weekly schedule is required';
  end if;
  v_schedule_changed := v_class.weekday is distinct from p_weekday
    or v_class.start_time is distinct from p_start_time
    or v_class.duration_minutes is distinct from p_duration_minutes;
  if v_schedule_changed then
    delete from public.lessons where class_id = p_class_id
      and scheduled_on >= v_today and scheduled_at >= now()
      and status = 'planned' and actual_at is null and attendance_completed_at is null;
  end if;
  update public.classes set curriculum_id = p_curriculum_id,
    weekday = p_weekday, start_time = p_start_time, duration_minutes = p_duration_minutes,
    schedule_effective_on = case when p_weekday is null then null
      when v_schedule_changed then v_today else schedule_effective_on end
    where id = p_class_id;
  if p_weekday is not null then
    perform public.ensure_class_lessons(p_class_id, v_today + 182);
  end if;
end;
$$;

create function public.set_lesson_exception(
  p_teacher_id uuid, p_lesson_id uuid, p_cancelled boolean, p_actual_at timestamptz
) returns void language plpgsql set search_path = '' as $$
declare v_lesson public.lessons;
begin
  select l.* into v_lesson from public.lessons l
    join public.class_teachers ct on ct.class_id = l.class_id
    join public.app_users u on u.id = ct.teacher_id
    where l.id = p_lesson_id and ct.teacher_id = p_teacher_id and u.role = 'teacher' and u.active
    for update of l;
  if not found then raise exception 'lesson is not in assigned class'; end if;
  if v_lesson.attendance_completed_at is not null then raise exception 'completed lesson cannot be changed'; end if;
  if p_cancelled and p_actual_at is not null then raise exception 'cancelled lesson cannot be moved'; end if;
  if p_actual_at is not null and (p_actual_at < now() - interval '1 year' or p_actual_at > now() + interval '2 years') then
    raise exception 'lesson date is out of range';
  end if;
  update public.lessons set status = case when p_cancelled then 'cancelled' else 'planned' end,
    actual_at = case when p_cancelled then null else p_actual_at end, updated_at = now()
    where id = p_lesson_id;
end;
$$;

create function public.set_topic_completion(
  p_teacher_id uuid, p_class_id uuid, p_student_id uuid, p_topic_id uuid, p_complete boolean
) returns void language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.classes c
    join public.class_teachers ct on ct.class_id = c.id
    join public.app_users u on u.id = ct.teacher_id
    join public.topics t on t.curriculum_id = c.curriculum_id
    join public.enrollments e on e.class_id = c.id and e.student_id = p_student_id and e.left_at is null
    where c.id = p_class_id and c.active and ct.teacher_id = p_teacher_id
      and u.role = 'teacher' and u.active and t.id = p_topic_id and t.active
  ) then raise exception 'student, topic or class access denied'; end if;
  if p_complete then
    insert into public.topic_completions(student_id, topic_id, class_id, marked_by)
      values (p_student_id, p_topic_id, p_class_id, p_teacher_id)
      on conflict (student_id, topic_id) do nothing;
  else
    delete from public.topic_completions where student_id = p_student_id and topic_id = p_topic_id;
  end if;
end;
$$;

create function public.record_attendance(
  p_teacher_id uuid, p_lesson_id uuid, p_student_id uuid, p_status text
) returns void language plpgsql set search_path = '' as $$
declare v_lesson public.lessons;
begin
  if p_status not in ('var', 'yok') then raise exception 'invalid attendance status'; end if;
  select l.* into v_lesson from public.lessons l
    join public.class_teachers ct on ct.class_id = l.class_id
    join public.app_users u on u.id = ct.teacher_id
    where l.id = p_lesson_id and ct.teacher_id = p_teacher_id and u.role = 'teacher' and u.active
    for update of l;
  if not found or v_lesson.status = 'cancelled' then raise exception 'lesson is unavailable'; end if;
  if coalesce(v_lesson.actual_at, v_lesson.scheduled_at) > now() then raise exception 'lesson has not started'; end if;
  if not exists (select 1 from public.enrollments e
    where e.class_id = v_lesson.class_id and e.student_id = p_student_id
      and e.joined_at <= coalesce(v_lesson.actual_at, v_lesson.scheduled_at)
      and (e.left_at is null or e.left_at > coalesce(v_lesson.actual_at, v_lesson.scheduled_at))
  ) then raise exception 'student was not enrolled for lesson'; end if;
  insert into public.attendance(lesson_id, student_id, status, marked_by)
    values (p_lesson_id, p_student_id, p_status, p_teacher_id)
    on conflict (lesson_id, student_id) do update set
      status = excluded.status, marked_by = excluded.marked_by, updated_at = now();
end;
$$;

create function public.finalize_lesson_attendance(p_teacher_id uuid, p_lesson_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_lesson public.lessons;
  v_roster_count integer;
  v_missing_count integer;
begin
  select l.* into v_lesson from public.lessons l
    join public.class_teachers ct on ct.class_id = l.class_id
    join public.app_users u on u.id = ct.teacher_id
    where l.id = p_lesson_id and ct.teacher_id = p_teacher_id and u.role = 'teacher' and u.active
    for update of l;
  if not found or v_lesson.status = 'cancelled' then raise exception 'lesson is unavailable'; end if;
  if coalesce(v_lesson.actual_at, v_lesson.scheduled_at) > now() then raise exception 'lesson has not started'; end if;
  select count(*), count(*) filter (where a.student_id is null)
    into v_roster_count, v_missing_count
    from (select distinct e.student_id from public.enrollments e
      where e.class_id = v_lesson.class_id
        and e.joined_at <= coalesce(v_lesson.actual_at, v_lesson.scheduled_at)
        and (e.left_at is null or e.left_at > coalesce(v_lesson.actual_at, v_lesson.scheduled_at))) roster
    left join public.attendance a on a.lesson_id = p_lesson_id and a.student_id = roster.student_id;
  if v_roster_count = 0 or v_missing_count > 0 then raise exception 'attendance is incomplete'; end if;
  update public.lessons set attendance_completed_at = coalesce(attendance_completed_at, now()), updated_at = now()
    where id = p_lesson_id;
end;
$$;

create function public.student_learning_summary(p_student_id uuid, p_class_id uuid)
returns table(total_topics bigint, completed_topics bigint, completed_lessons bigint, present_lessons bigint)
language sql stable set search_path = '' as $$
  select
    (select count(*) from public.topics t join public.classes c on c.curriculum_id = t.curriculum_id
      where c.id = p_class_id and t.active),
    (select count(*) from public.topic_completions tc
      join public.topics t on t.id = tc.topic_id and t.active
      join public.classes c on c.curriculum_id = t.curriculum_id
      where c.id = p_class_id and tc.student_id = p_student_id),
    (select count(*) from public.lessons l where l.class_id = p_class_id and l.status = 'planned'
      and l.attendance_completed_at is not null
      and exists (select 1 from public.enrollments e where e.class_id = p_class_id
        and e.student_id = p_student_id and e.joined_at <= coalesce(l.actual_at, l.scheduled_at)
        and (e.left_at is null or e.left_at > coalesce(l.actual_at, l.scheduled_at)))),
    (select count(*) from public.lessons l join public.attendance a on a.lesson_id = l.id
      where l.class_id = p_class_id and l.status = 'planned' and l.attendance_completed_at is not null
        and a.student_id = p_student_id and a.status = 'var'
        and exists (select 1 from public.enrollments e where e.class_id = p_class_id
          and e.student_id = p_student_id and e.joined_at <= coalesce(l.actual_at, l.scheduled_at)
          and (e.left_at is null or e.left_at > coalesce(l.actual_at, l.scheduled_at))));
$$;

revoke all on function public.ensure_class_lessons(uuid, date) from public, anon, authenticated;
revoke all on function public.set_class_learning_plan(uuid, uuid, uuid, smallint, time, smallint) from public, anon, authenticated;
revoke all on function public.set_lesson_exception(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.set_topic_completion(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.record_attendance(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_lesson_attendance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.student_learning_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_class_lessons(uuid, date) to service_role;
grant execute on function public.set_class_learning_plan(uuid, uuid, uuid, smallint, time, smallint) to service_role;
grant execute on function public.set_lesson_exception(uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.set_topic_completion(uuid, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.record_attendance(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finalize_lesson_attendance(uuid, uuid) to service_role;
grant execute on function public.student_learning_summary(uuid, uuid) to service_role;
