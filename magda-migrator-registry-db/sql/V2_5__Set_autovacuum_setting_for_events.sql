DO $$
DECLARE
	autovacuum_freeze_max_age TEXT;
	autovacuum_multixact_freeze_max_age TEXT;
BEGIN
	SELECT option_value INTO autovacuum_freeze_max_age
	FROM pg_class c, pg_options_to_table(c.reloptions)
	WHERE c.relname='events' AND option_name='autovacuum_freeze_max_age';
	
	IF autovacuum_freeze_max_age ISNULL THEN
		autovacuum_freeze_max_age = '100000';
		EXECUTE('ALTER TABLE events SET ( autovacuum_freeze_max_age = ' || autovacuum_freeze_max_age || ')');	
		RAISE INFO 'SET autovacuum_freeze_max_age to: %', autovacuum_freeze_max_age;
	ELSE 
		RAISE INFO 'Leave autovacuum_freeze_max_age unchanged: %', autovacuum_freeze_max_age;
	END IF;
	
	SELECT option_value INTO autovacuum_multixact_freeze_max_age
	FROM pg_class c, pg_options_to_table(c.reloptions)
	WHERE c.relname='events' AND option_name='autovacuum_multixact_freeze_max_age';
	
	IF autovacuum_multixact_freeze_max_age ISNULL THEN
		autovacuum_multixact_freeze_max_age = '200000';
		EXECUTE('ALTER TABLE events SET ( autovacuum_multixact_freeze_max_age = ' || autovacuum_multixact_freeze_max_age || ')');	
		RAISE INFO 'SET autovacuum_multixact_freeze_max_age to: %', autovacuum_multixact_freeze_max_age;
	ELSE 
		RAISE INFO 'Leave autovacuum_multixact_freeze_max_age unchanged: %', autovacuum_multixact_freeze_max_age;
	END IF;
END $$;