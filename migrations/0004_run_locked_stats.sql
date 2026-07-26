-- Lock score/kills/accuracy on the run row at completion time so leaderboard
-- POST cannot rewrite combat stats after the official clock stops.
ALTER TABLE leaderboard_runs ADD COLUMN score INTEGER;
ALTER TABLE leaderboard_runs ADD COLUMN kills INTEGER;
ALTER TABLE leaderboard_runs ADD COLUMN accuracy INTEGER;
