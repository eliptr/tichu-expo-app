drop policy if exists "Users can delete their own matches" on public.matches;
create policy "Users can delete their own matches"
on public.matches
for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.rooms
    where rooms.match_id = matches.id
    and rooms.host_user_id = (select auth.uid())
  )
);
