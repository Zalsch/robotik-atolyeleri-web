-- Keep an audit trail for deductions; negative entries never create food.
alter table public.aquarium_rewards drop constraint aquarium_rewards_points_check;
alter table public.aquarium_rewards add constraint aquarium_rewards_points_check check (points between -10 and 10 and points<>0);
create function public.deduct_aquarium_points(p_teacher_id uuid, p_class_id uuid, p_student_id uuid, p_points integer, p_request_id uuid)
returns table(reward_id uuid, awarded_points smallint, awarded_at timestamptz, total_points bigint)
language plpgsql security invoker set search_path = '' as $$
declare v_reward public.aquarium_rewards%rowtype; v_total bigint;
begin
  if p_points is null or p_points not between 1 and 10 or p_request_id is null then raise exception 'invalid award'; end if;
  if not exists (
    select 1 from public.class_teachers ct
    join public.classes c on c.id=ct.class_id and c.active
    join public.app_users u on u.id=ct.teacher_id and u.active and u.role='teacher'
    where ct.class_id=p_class_id and ct.teacher_id=p_teacher_id
  ) then raise exception 'teacher is not assigned to active class'; end if;
  if not exists (
    select 1 from public.enrollments e
    join public.app_users u on u.id=e.student_id and u.active and u.role='student'
    where e.class_id=p_class_id and e.student_id=p_student_id and e.left_at is null
  ) then raise exception 'student is not active in class'; end if;
  -- A retried request cannot award twice, including across concurrent workers.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_reward from public.aquarium_rewards where id=p_request_id;
  if found then
    if v_reward.class_id<>p_class_id or v_reward.student_id<>p_student_id or v_reward.teacher_id<>p_teacher_id or v_reward.points<>-p_points then
      raise exception 'request id already belongs to another award';
    end if;
    select s.points into v_total from public.aquarium_scores s where s.class_id=p_class_id and s.student_id=p_student_id;
  else
    update public.aquarium_scores s set points=s.points-p_points
      where s.class_id=p_class_id and s.student_id=p_student_id and s.points>=p_points
      returning s.points into v_total;
    if v_total is null then raise exception 'insufficient aquarium points'; end if;
    insert into public.aquarium_rewards(id,class_id,student_id,teacher_id,points)
      values(p_request_id,p_class_id,p_student_id,p_teacher_id,-p_points) returning * into v_reward;
  end if;
  return query select v_reward.id, v_reward.points, v_reward.created_at, v_total;
end;
$$;
revoke all on function public.deduct_aquarium_points(uuid,uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.deduct_aquarium_points(uuid,uuid,uuid,integer,uuid) to service_role;
