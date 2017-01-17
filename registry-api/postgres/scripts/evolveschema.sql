CREATE TABLE IF NOT EXISTS Users (
    userID int PRIMARY KEY,
    userName varchar(100) NOT NULL
    -- TODO: add hashed password or something
);

-- Add a temporary user to own the updates, until we have real users
INSERT INTO Users (userID, userName) VALUES (0, 'System');

CREATE TABLE IF NOT EXISTS EventTypes (
    eventTypeID int PRIMARY KEY,
    name varchar(100)
);

INSERT INTO EventTypes (eventTypeID, name) VALUES (0, 'Create Record');
INSERT INTO EventTypes (eventTypeID, name) VALUES (1, 'Create Section Definition');
INSERT INTO EventTypes (eventTypeID, name) VALUES (2, 'Create Record Section');
INSERT INTO EventTypes (eventTypeID, name) VALUES (3, 'Patch Record');
INSERT INTO EventTypes (eventTypeID, name) VALUES (4, 'Patch Section Definition');
INSERT INTO EventTypes (eventTypeID, name) VALUES (5, 'Patch Record Section');
INSERT INTO EventTypes (eventTypeID, name) VALUES (6, 'Delete Record');
INSERT INTO EventTypes (eventTypeID, name) VALUES (7, 'Delete Section Definition');
INSERT INTO EventTypes (eventTypeID, name) VALUES (8, 'Delete Record Section');

CREATE TABLE IF NOT EXISTS Events (
    eventID bigserial PRIMARY KEY,
    eventTime timestamp with time zone DEFAULT (now() at time zone 'utc'),
    eventTypeID int REFERENCES EventTypes NOT NULL,
    userID int REFERENCES Users NOT NULL,
    data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS Record (
    recordID varchar(100) PRIMARY KEY,
    name varchar(1000) NOT NULL,
    lastUpdate bigint REFERENCES Events NOT NULL
);

CREATE TABLE IF NOT EXISTS Section (
    sectionID varchar(100) PRIMARY KEY,
    name varchar(100) NOT NULL,
    lastUpdate bigint REFERENCES Events NOT NULL,
    jsonSchema jsonb
);

CREATE TABLE IF NOT EXISTS RecordSection (
    recordID varchar(100) REFERENCES Record NOT NULL,
    sectionID varchar(100) REFERENCES Section NOT NULL,
    lastUpdate bigint REFERENCES Events NOT NULL,
    data jsonb NOT NULL,
    PRIMARY KEY (recordID, sectionID)
);
