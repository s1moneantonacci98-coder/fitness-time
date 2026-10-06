-- Permesso per eliminare atleti dal pannello (DEMO, senza login). Da restringere quando c'e' il login di Andrea.
grant delete on public.fitnesstime_profiles to anon;
drop policy if exists fitnesstime_profiles_anon_delete_atleti on public.fitnesstime_profiles;
create policy fitnesstime_profiles_anon_delete_atleti on public.fitnesstime_profiles
  for delete to anon
  using (ruolo = 'athlete');
