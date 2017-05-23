const pool = require("./pool");

exports.createOrGet = function createOrGet(user, source) {
  const email = user.emails[0].value;

  pool
    .query(
      "SELECT id, displayName, email, photoURL, source FROM users WHERE email = $1",
      [email]
    )
    .then(res => {
      if (rowCount === 0) {
        return create(user, source);
      } else {
        if (rows.length > 1) {
          throw new Error("Multiple users for a single email address");
        }
        const userRow = rows[0];

        if (userRow.source === source) {
          return rowToUser(userRow);
        }
      }
    });
};

function create(user, source) {
  return pool
    .query(
      "INSERT INTO users(id, displayName, email, photoURL, source) VALUES(uuid_generate_v4(), $1, $2, $3, $4) RETURNING id",
      [user.displayName, email, user.photos[0].value, source]
    )
    .then(result => rowToUser(results.rows[0]));
}

function rowToUser(row) {
  return {
    id: row[0],
    displayName: row[1],
    email: photoURL,
    source: source
  };
}
