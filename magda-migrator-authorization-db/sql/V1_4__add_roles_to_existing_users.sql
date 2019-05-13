-- Add default roles to existing users
INSERT INTO user_roles 
(id, user_id, role_id)
(
	SELECT uuid_generate_v4() as id, u.id as user_id, 
	(CASE 
		WHEN u."isAdmin" = true THEN '00000000-0000-0003-0000-000000000000'::uuid
		ELSE '00000000-0000-0002-0000-000000000000'::uuid
	END) as role_id
	FROM users AS u
	LEFT JOIN user_roles AS r ON r.user_id = u.id
	WHERE r.id is NULL
)
