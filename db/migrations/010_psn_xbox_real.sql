-- 010: PSN și Xbox au acum provider real (D55); Epic rămâne cu date demo (MockProvider).
-- Conturile PSN / Xbox se leagă de acum doar prin fluxurile dedicate (Online ID, respectiv login Microsoft).
UPDATE platforms SET is_mock = false WHERE code IN ('psn', 'xbox');
