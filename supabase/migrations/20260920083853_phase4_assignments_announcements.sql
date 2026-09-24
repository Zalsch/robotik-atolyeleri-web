-- Phase 4: Drive-linked physical assignments and in-app class announcements.
-- Existing account, class, learning and attendance records are unchanged.
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  title text not null check (length(trim(title)) between 2 and 120),
  description text not null default '' check (length(description) <= 2000),
  drive_url text not null check (length(drive_url) <= 2048 and drive_url ~ '^https://(drive\.google\.com|docs\.google\.com)/'),
  due_at timestamptz not null,
  created_by uuid not null references public.app_users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_class_due_idx on public.assignments (class_id, due_at desc, id);

create table public.assignment_statuses (
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.app_users(id),
  status text not null check (status in ('getirdi', 'getirmedi')),
  marked_by uuid not null references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
create index assignment_statuses_student_idx on public.assignment_statuses (student_id, assignment_id);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  title text not null check (length(trim(title)) between 2 and 120),
  body text not null check (length(trim(body)) between 2 and 4000),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);
create index announcements_class_created_idx on public.announcements (class_id, created_at desc, id desc);

alter table public.assignments enable row level security;
alter table public.assignment_statuses enable row level security;
alter table public.announcements enable row level security;
revoke all on public.assignments, public.assignment_statuses, public.announcements from public, anon, authenticated;
grant select, insert, update, delete on public.assignments, public.assignment_statuses, public.announcements to service_role;

create function public.mark_assignment_status(
  p_teacher_id uuid, p_assignment_id uuid, p_student_id uuid, p_status text
) returns void language plpgsql set search_path = '' as $$
declare v_class_id uuid;
begin
  if p_status not in ('getirdi', 'getirmedi') then raise exception 'invalid assignment status'; end if;
  select a.class_id into v_class_id from public.assignments a
    join public.classes c on c.id = a.class_id and c.active
    join public.class_teachers ct on ct.class_id = c.id and ct.teacher_id = p_teacher_id
    join public.app_users teacher on teacher.id = p_teacher_id and teacher.role = 'teacher' and teacher.active
    where a.id = p_assignment_id and a.active;
  if v_class_id is null then raise exception 'assignment is not in assigned class'; end if;
  if not exists (
    select 1 from public.enrollments e
    join public.app_users student on student.id = e.student_id and student.role = 'student' and student.active
    where e.class_id = v_class_id and e.student_id = p_student_id and e.left_at is null
  ) then raise exception 'student is not enrolled in assigned class'; end if;
  insert into public.assignment_statuses (assignment_id, student_id, status, marked_by)
    values (p_assignment_id, p_student_id, p_status, p_teacher_id)
    on conflict (assignment_id, student_id) do update set
      status = excluded.status, marked_by = excluded.marked_by, updated_at = now();
end;
$$;
revoke all on function public.mark_assignment_status(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_assignment_status(uuid, uuid, uuid, text) to service_role;
