-- Fix for 20261117000100: start_game and set_username insert the player's
-- profile with "on conflict do nothing". A BEFORE INSERT trigger runs before
-- the conflict is found, so for a guest (whose profile already exists, with no
-- account) the account check raised instead of the insert quietly doing
-- nothing. A profile that already exists is left to the conflict.
create or replace function public.check_profile_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_guest
     and not exists (select 1 from auth.users u where u.id = new.id)
     and (tg_op = 'UPDATE' or not exists (select 1 from public.profiles p where p.id = new.id)) then
    raise exception 'profile % has no account', new.id using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_profile_account() from public, anon, authenticated;
grant execute on function public.check_profile_account() to service_role;
