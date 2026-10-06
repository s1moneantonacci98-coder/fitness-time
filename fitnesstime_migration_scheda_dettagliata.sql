-- Scheda dettagliata stile Andrea (2026-10-06): range recupero, tecnica, addome/cardio per giorno.
alter table public.fitnesstime_esercizi
  add column if not exists recupero_max_secondi integer check (recupero_max_secondi is null or recupero_max_secondi >= 0),
  add column if not exists tecnica text;
alter table public.fitnesstime_sessioni
  add column if not exists addome text,
  add column if not exists cardio text;
alter table public.fitnesstime_esercizi add column if not exists rir_testo text;
