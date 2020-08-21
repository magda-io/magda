-- Add default Authenticated Users role to existing users
INSERT INTO user_roles 
(id, user_id, role_id)
(
	SELECT uuid_generate_v4() as id, u.id as user_id, '00000000-0000-0002-0000-000000000000'::uuid as role_id
	FROM users AS u
	LEFT JOIN user_roles AS r ON r.user_id = u.id
	WHERE u.id NOT IN (SELECT user_roles.user_id FROM user_roles WHERE user_roles.role_id = '00000000-0000-0002-0000-000000000000'::uuid) 
);

-- Add default Authenticated Users role to existing admin users
INSERT INTO user_roles 
(id, user_id, role_id)
(
	SELECT uuid_generate_v4() as id, u.id as user_id, '00000000-0000-0003-0000-000000000000'::uuid as role_id
	FROM users AS u
	LEFT JOIN user_roles AS r ON r.user_id = u.id
	WHERE u."isAdmin" = true AND u.id NOT IN (SELECT user_roles.user_id FROM user_roles WHERE user_roles.role_id = '00000000-0000-0003-0000-000000000000'::uuid) 
)
