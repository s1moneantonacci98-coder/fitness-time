-- BIA completa (2026-10-06): tutti i parametri del PDF dello strumento. Applicata live.
alter table public.fitnesstime_misure_bia
  add column if not exists altezza_cm numeric check (altezza_cm is null or altezza_cm > 0),
  add column if not exists rz_ohm numeric check (rz_ohm is null or rz_ohm >= 0),
  add column if not exists xc_ohm numeric check (xc_ohm is null or xc_ohm >= 0),
  add column if not exists pha_gradi numeric check (pha_gradi is null or pha_gradi >= 0),
  add column if not exists bmr_kcal numeric check (bmr_kcal is null or bmr_kcal >= 0),
  add column if not exists bcmi numeric check (bcmi is null or bcmi >= 0),
  add column if not exists bcm_kg numeric check (bcm_kg is null or bcm_kg >= 0),
  add column if not exists massa_grassa_kg numeric check (massa_grassa_kg is null or massa_grassa_kg >= 0),
  add column if not exists smm_kg numeric check (smm_kg is null or smm_kg >= 0),
  add column if not exists asmm_kg numeric check (asmm_kg is null or asmm_kg >= 0),
  add column if not exists tbw_l numeric check (tbw_l is null or tbw_l >= 0),
  add column if not exists ecw_l numeric check (ecw_l is null or ecw_l >= 0),
  add column if not exists icw_l numeric check (icw_l is null or icw_l >= 0);
