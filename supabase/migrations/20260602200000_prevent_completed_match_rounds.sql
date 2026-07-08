create or replace function public.prevent_rounds_for_completed_matches()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.matches
    where id = new.match_id
    and status = 'completed'
  ) then
    raise exception 'Cannot add or change rounds for a completed match.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_completed_match_round_insert on public.rounds;
create trigger prevent_completed_match_round_insert
before insert on public.rounds
for each row execute function public.prevent_rounds_for_completed_matches();

drop trigger if exists prevent_completed_match_round_update on public.rounds;
create trigger prevent_completed_match_round_update
before update on public.rounds
for each row execute function public.prevent_rounds_for_completed_matches();
