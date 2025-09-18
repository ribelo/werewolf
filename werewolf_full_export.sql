PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);
INSERT INTO _sqlx_migrations VALUES(20250823131642,'initial schema','2025-09-01 21:50:16',1,X'27a608ef5386b54f2b78e16eb05a09568e46cc538ef32fffb0cc261f1e6de2692f800fad1cd79011b3daae8fe9484de1',875981);
INSERT INTO _sqlx_migrations VALUES(20250901150000,'add competition order','2025-09-01 21:50:16',1,X'7af69a9304c0cec5c97b2e9b0d808474bf74a658a72fe2f31319a487090d8671035f9a8e6b74b02f022851b1a0f8af37',267822);
INSERT INTO _sqlx_migrations VALUES(20250901160000,'fix attempt constraints','2025-09-01 21:50:16',1,X'9f6716b50921d6ad16c2191e101e33b7e34bba29200e9c441d89158688c05c70061ddf63d91e1ac584969a4dfc38d0c6',34917);
CREATE TABLE contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL, -- ISO 8601 format
    location TEXT NOT NULL,
    discipline TEXT NOT NULL CHECK(discipline IN ('Bench','Squat','Deadlift','Powerlifting')),
    status TEXT NOT NULL DEFAULT 'Setup' CHECK(status IN ('Setup','InProgress','Paused','Completed')),
    federation_rules TEXT, -- Nullable - not every competition needs federation
    competition_type TEXT, -- Local/Regional/National/International
    organizer TEXT, -- Who is organizing this competition
    notes TEXT, -- Additional competition notes
    is_archived BOOLEAN NOT NULL DEFAULT FALSE, -- For competition history
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, bar_weight REAL DEFAULT 20.0);
INSERT INTO contests VALUES('c4d5f19f-f51b-418c-be4e-c4292de3bc58','Demo Powerlifting Competition','2025-09-02','Demo Gym','Powerlifting','Setup','IPF Rules','Regional Championship','Demo Organizer','Generated demo competition with 10 competitors',0,'2025-09-01 22:02:14','2025-09-01 22:02:14',20.0);
CREATE TABLE age_categories (
    id TEXT PRIMARY KEY, -- e.g., 'JUNIOR13', 'SENIOR', 'VETERAN40'
    name TEXT NOT NULL UNIQUE, -- 'Junior 13', 'Senior', 'Veteran 40'
    min_age INTEGER, -- Minimum age (NULL for no limit)
    max_age INTEGER  -- Maximum age (NULL for no limit)
);
INSERT INTO age_categories VALUES('JUNIOR13','Junior 13',13,15);
INSERT INTO age_categories VALUES('JUNIOR16','Junior 16',16,18);
INSERT INTO age_categories VALUES('JUNIOR19','Junior 19',19,19);
INSERT INTO age_categories VALUES('JUNIOR23','Junior 23',20,23);
INSERT INTO age_categories VALUES('SENIOR','Senior',24,39);
INSERT INTO age_categories VALUES('VETERAN40','Veteran 40',40,49);
INSERT INTO age_categories VALUES('VETERAN50','Veteran 50',50,59);
INSERT INTO age_categories VALUES('VETERAN60','Veteran 60',60,69);
INSERT INTO age_categories VALUES('VETERAN70','Veteran 70',70,NULL);
INSERT INTO age_categories VALUES('JUNIOR','Junior',14,23);
CREATE TABLE weight_classes (
    id TEXT PRIMARY KEY,
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    name TEXT NOT NULL, -- e.g., "DO 75 KG", "+ 140 KG"
    weight_min REAL, -- Minimum weight in kg (NULL for open class)
    weight_max REAL, -- Maximum weight in kg (NULL for open class)
    UNIQUE(gender, name)
);
INSERT INTO weight_classes VALUES('M_52','Male','DO 52 KG',NULL,52.0);
INSERT INTO weight_classes VALUES('M_56','Male','DO 56 KG',52.00999999999999802,56.0);
INSERT INTO weight_classes VALUES('M_60','Male','DO 60 KG',56.00999999999999802,60.0);
INSERT INTO weight_classes VALUES('M_67_5','Male','DO 67.5 KG',60.00999999999999802,67.5);
INSERT INTO weight_classes VALUES('M_75','Male','DO 75 KG',67.51000000000000511,75.0);
INSERT INTO weight_classes VALUES('M_82_5','Male','DO 82.5 KG',75.01000000000000511,82.5);
INSERT INTO weight_classes VALUES('M_90','Male','DO 90 KG',82.51000000000000511,90.0);
INSERT INTO weight_classes VALUES('M_100','Male','DO 100 KG',90.01000000000000511,100.0);
INSERT INTO weight_classes VALUES('M_110','Male','DO 110 KG',100.0100000000000051,110.0);
INSERT INTO weight_classes VALUES('M_125','Male','DO 125 KG',110.0100000000000051,125.0);
INSERT INTO weight_classes VALUES('M_140','Male','DO 140 KG',125.0100000000000051,140.0);
INSERT INTO weight_classes VALUES('M_140_PLUS','Male','+ 140 KG',140.009999999999991,NULL);
INSERT INTO weight_classes VALUES('F_47','Female','DO 47 KG',NULL,47.0);
INSERT INTO weight_classes VALUES('F_52','Female','DO 52 KG',47.00999999999999802,52.0);
INSERT INTO weight_classes VALUES('F_57','Female','DO 57 KG',52.00999999999999802,57.0);
INSERT INTO weight_classes VALUES('F_63','Female','DO 63 KG',57.00999999999999802,63.0);
INSERT INTO weight_classes VALUES('F_72','Female','DO 72 KG',63.00999999999999802,72.0);
INSERT INTO weight_classes VALUES('F_84','Female','DO 84 KG',72.01000000000000511,84.0);
INSERT INTO weight_classes VALUES('F_84_PLUS','Female','+ 84 KG',84.01000000000000511,NULL);
INSERT INTO weight_classes VALUES('M59','Male','DO 59 KG',NULL,59.0);
INSERT INTO weight_classes VALUES('M66','Male','DO 66 KG',59.00999999999999802,66.0);
INSERT INTO weight_classes VALUES('M74','Male','DO 74 KG',66.01000000000000511,74.0);
INSERT INTO weight_classes VALUES('M83','Male','DO 83 KG',74.01000000000000511,83.0);
INSERT INTO weight_classes VALUES('M93','Male','DO 93 KG',83.01000000000000511,93.0);
INSERT INTO weight_classes VALUES('M105','Male','DO 105 KG',93.0100000000000051,105.0);
INSERT INTO weight_classes VALUES('M120','Male','DO 120 KG',105.0100000000000051,120.0);
INSERT INTO weight_classes VALUES('M120+','Male','+ 120 KG',120.0100000000000051,NULL);
INSERT INTO weight_classes VALUES('F69','Female','DO 69 KG',63.00999999999999802,69.0);
INSERT INTO weight_classes VALUES('F76','Female','DO 76 KG',69.01000000000000511,76.0);
CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL, -- IMIĘ
    last_name TEXT NOT NULL,  -- NAZWISKO
    birth_date TEXT NOT NULL, -- Full birth date for accurate age calculation (YYYY-MM-DD)
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    club TEXT, -- KLUB - can change over time, but stored here for simplicity
    city TEXT, -- MIEJSCOWOŚĆ - hometown
    notes TEXT, -- Additional notes about the competitor
    photo_data BLOB, -- Photo stored as BLOB
    photo_format TEXT DEFAULT 'webp', -- Photo format (webp, jpeg, png)
    photo_metadata TEXT, -- JSON with original dimensions, file size, etc.
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, competition_order INTEGER NOT NULL DEFAULT 0);
INSERT INTO competitors VALUES('9f1692a6-fad7-409d-b9f8-d442294b0117','Jan','Kowalski','1999-03-15','Male','Siła Warszawa','Warszawa',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',1);
INSERT INTO competitors VALUES('4f7cecbb-48dc-483d-84a3-f9019e73df3e','Anna','Nowak','1996-07-22','Female','Power Kraków','Kraków',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',2);
INSERT INTO competitors VALUES('95cd7ca2-df1d-424b-8d05-08d17f7f413a','Piotr','Wiśniewski','1989-11-08','Male','Strong Gdańsk','Gdańsk',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',3);
INSERT INTO competitors VALUES('28ea3eee-65bd-4bdb-9251-b69f44b92ccb','Katarzyna','Wójcik','2002-01-18','Female','Fit Wrocław','Wrocław',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',4);
INSERT INTO competitors VALUES('7a5650ca-095f-4cb8-9ef7-86e5f6130292','Michał','Kamiński','1982-09-03','Male','Atlas Poznań','Poznań',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',5);
INSERT INTO competitors VALUES('384b3761-7c7a-42f9-b2bb-013df54f7937','Magdalena','Lewandowska','1993-05-12','Female','Iron Łódź','Łódź',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',6);
INSERT INTO competitors VALUES('fe5961b7-1100-4e0e-b297-148e7d64823c','Tomasz','Zieliński','2005-12-07','Male','Young Power','Katowice',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',7);
INSERT INTO competitors VALUES('617a492b-cf03-4ced-afa3-376569547964','Małgorzata','Szymańska','1979-04-25','Female','Veteran Strength','Lublin',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',8);
INSERT INTO competitors VALUES('45e2bc78-1a96-4dee-b304-24ad66c0e43c','Krzysztof','Woźniak','1986-08-14','Male','Heavy Lifting','Szczecin',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',9);
INSERT INTO competitors VALUES('104ce993-7568-4393-a103-50a1dd84119a','Agnieszka','Dąbrowska','1998-10-30','Female','Elite Lifting','Białystok',NULL,NULL,NULL,NULL,'2025-09-01 22:02:14','2025-09-01 22:02:14',10);
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,
    
    -- Categories determined at registration based on age/weight on contest day
    age_category_id TEXT NOT NULL,
    weight_class_id TEXT NOT NULL,
    
    -- Equipment flags based on CSV data (M, SM, T columns)
    equipment_m BOOLEAN NOT NULL DEFAULT FALSE, -- Multi-ply equipment
    equipment_sm BOOLEAN NOT NULL DEFAULT FALSE, -- Single-ply equipment  
    equipment_t BOOLEAN NOT NULL DEFAULT FALSE, -- Equipped shirt/suit
    
    -- Day-of competition data
    bodyweight REAL NOT NULL, -- WAGA - actual weight on contest day
    lot_number TEXT, -- Competition number for the day
    personal_record_at_entry REAL, -- REKORD ŻYCIOWY - PR at time of entry
    
    -- Calculated coefficients (stored for performance)
    reshel_coefficient REAL, -- WSP. RESHEL
    mccullough_coefficient REAL, -- WSP. MCCULLOUGH
    
    -- Equipment-specific settings
    rack_height_squat INTEGER, -- WYS. STOJAKA for squat (1-20)
    rack_height_bench INTEGER, -- WYS. STOJAKA for bench (1-20)
    
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (weight_class_id) REFERENCES weight_classes(id),
    UNIQUE(contest_id, competitor_id) -- One registration per competitor per contest
);
INSERT INTO registrations VALUES('41f754c3-20be-4785-a18b-3de46344ab54','c4d5f19f-f51b-418c-be4e-c4292de3bc58','9f1692a6-fad7-409d-b9f8-d442294b0117','SENIOR','M120+',1,0,0,82.5,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('4d428e98-6888-4433-82ea-6fc44340d6d8','c4d5f19f-f51b-418c-be4e-c4292de3bc58','4f7cecbb-48dc-483d-84a3-f9019e73df3e','SENIOR','F_84_PLUS',1,0,0,63.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','c4d5f19f-f51b-418c-be4e-c4292de3bc58','95cd7ca2-df1d-424b-8d05-08d17f7f413a','SENIOR','M120+',1,0,0,93.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('b3d57060-62f8-46c8-a1b3-fde17c7c6793','c4d5f19f-f51b-418c-be4e-c4292de3bc58','28ea3eee-65bd-4bdb-9251-b69f44b92ccb','JUNIOR','F_84_PLUS',1,0,0,57.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('61d0d6f4-1be1-4119-8523-29bd8ec66144','c4d5f19f-f51b-418c-be4e-c4292de3bc58','7a5650ca-095f-4cb8-9ef7-86e5f6130292','VETERAN40','M120+',1,0,0,105.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','c4d5f19f-f51b-418c-be4e-c4292de3bc58','384b3761-7c7a-42f9-b2bb-013df54f7937','SENIOR','F_84_PLUS',1,0,0,72.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','c4d5f19f-f51b-418c-be4e-c4292de3bc58','fe5961b7-1100-4e0e-b297-148e7d64823c','JUNIOR','M120+',1,0,0,74.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('00226901-18ac-482c-ac1a-db687cf05951','c4d5f19f-f51b-418c-be4e-c4292de3bc58','617a492b-cf03-4ced-afa3-376569547964','VETERAN40','F_84_PLUS',1,0,0,84.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('1f243f5a-31cc-47f9-ab5d-909afb5095bf','c4d5f19f-f51b-418c-be4e-c4292de3bc58','45e2bc78-1a96-4dee-b304-24ad66c0e43c','SENIOR','M120+',1,0,0,120.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('ec969c7a-004b-4643-a3e7-ace1e484c2e1','c4d5f19f-f51b-418c-be4e-c4292de3bc58','104ce993-7568-4393-a103-50a1dd84119a','SENIOR','F_84_PLUS',1,0,0,69.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:14');
INSERT INTO registrations VALUES('417517fd-d65b-4d42-95ac-c188f0d10d93','81431f7c-1b36-4b6f-a602-55a41724871a','19ef89c7-d1de-4b33-8458-b7f885987174','SENIOR','M120+',1,0,0,82.5,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','81431f7c-1b36-4b6f-a602-55a41724871a','4a4d0a66-c4b9-4cc3-aa27-fcb486cc59aa','SENIOR','F_84_PLUS',1,0,0,63.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('8fe968f3-491e-4fe7-be33-77268bd9f473','81431f7c-1b36-4b6f-a602-55a41724871a','0471d8e8-320d-416c-8055-337e17a7a807','SENIOR','M120+',1,0,0,93.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('122dfe3e-f668-4695-af20-4cec787b0316','81431f7c-1b36-4b6f-a602-55a41724871a','97738488-5da6-4a50-96ed-a312473b0bbb','JUNIOR','F_84_PLUS',1,0,0,57.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('9b22c7cc-58fd-43c6-b930-ba031782edf7','81431f7c-1b36-4b6f-a602-55a41724871a','aafa9c60-f0da-44d3-8890-3dfba80f29b6','VETERAN40','M120+',1,0,0,105.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('752dbab1-492f-4ac3-9f0b-e5771d54fedc','81431f7c-1b36-4b6f-a602-55a41724871a','822b76e8-2710-4be5-a320-b4dcc974183f','SENIOR','F_84_PLUS',1,0,0,72.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('e65e392a-6f1d-4489-b997-b69d773449e0','81431f7c-1b36-4b6f-a602-55a41724871a','ee197052-9157-45f0-8b6b-51b8eef60e4d','JUNIOR','M120+',1,0,0,74.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('265a5c8c-1e97-40b2-b351-86fc9328bc78','81431f7c-1b36-4b6f-a602-55a41724871a','1d47d312-331b-4e62-a702-4787de81da9e','VETERAN40','F_84_PLUS',1,0,0,84.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('56b25440-bb63-4f41-95f8-635a7a58a406','81431f7c-1b36-4b6f-a602-55a41724871a','0150a97c-8783-43ce-8695-9e29149b2ca5','SENIOR','M120+',1,0,0,120.0,NULL,NULL,NULL,NULL,12,8,'2025-09-01 22:02:34');
INSERT INTO registrations VALUES('efbd93fd-8362-49b8-81c2-4decb0c11f78','81431f7c-1b36-4b6f-a602-55a41724871a','32b79a20-89c0-42cc-b3fd-3c2d06e7cb32','SENIOR','F_84_PLUS',1,0,0,69.0,NULL,NULL,NULL,NULL,10,6,'2025-09-01 22:02:34');
CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)), -- Added 4th for record attempts
    weight REAL NOT NULL CHECK(weight >= 0), -- Allow 0 for not-yet-attempted lifts
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Successful','Failed','Skipped')),
    timestamp TEXT, -- When attempt was completed
    judge1_decision BOOLEAN, -- First judge decision (NULL = not judged yet)
    judge2_decision BOOLEAN, -- Second judge decision
    judge3_decision BOOLEAN, -- Third judge decision
    notes TEXT, -- Additional notes about the attempt
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(registration_id, lift_type, attempt_number) -- One attempt per lift per number
);
INSERT INTO attempts VALUES('5022dc24-ef33-46de-a7c3-81c4766bba71','41f754c3-20be-4785-a18b-3de46344ab54','Squat',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b03653ab-bc69-4e16-983c-36e49b22b9f8','41f754c3-20be-4785-a18b-3de46344ab54','Squat',2,140.5,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('1d830d98-2877-4657-a03f-44e1b21998cb','41f754c3-20be-4785-a18b-3de46344ab54','Squat',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('d2459d4d-2112-47d8-848e-24e6a44c9497','41f754c3-20be-4785-a18b-3de46344ab54','Bench',1,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b1c459d4-1090-47c3-9d2a-684cc088c7df','41f754c3-20be-4785-a18b-3de46344ab54','Bench',2,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('ba0ede3a-d071-4762-8e8f-2ff9e6a0acd0','41f754c3-20be-4785-a18b-3de46344ab54','Bench',3,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('2948cf73-b030-4d41-891c-f88d7c8e32cb','41f754c3-20be-4785-a18b-3de46344ab54','Deadlift',1,180.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('18b05efd-2a6e-457e-9457-8576c6c69d9d','41f754c3-20be-4785-a18b-3de46344ab54','Deadlift',2,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('4b81f199-3e88-4110-a77a-de413327b361','41f754c3-20be-4785-a18b-3de46344ab54','Deadlift',3,200.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('3e5c2eed-1462-4d33-bfb1-012834492c65','4d428e98-6888-4433-82ea-6fc44340d6d8','Squat',1,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('d4ff1de1-20c2-4071-a346-7f7da9819542','4d428e98-6888-4433-82ea-6fc44340d6d8','Squat',2,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('31d81021-2fac-489a-9c06-9b0fe643bc0f','4d428e98-6888-4433-82ea-6fc44340d6d8','Squat',3,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('d73890b5-7509-47f5-8a48-6774e7bd0f60','4d428e98-6888-4433-82ea-6fc44340d6d8','Bench',1,55.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('432a2a8a-7342-459e-9a80-68b7395990f6','4d428e98-6888-4433-82ea-6fc44340d6d8','Bench',2,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('3cc7e63a-cbab-4d44-8b8c-c3d4ca26ae24','4d428e98-6888-4433-82ea-6fc44340d6d8','Bench',3,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('ff8ef991-1f5f-4d7e-9771-23bb4e16ec88','4d428e98-6888-4433-82ea-6fc44340d6d8','Deadlift',1,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('e90bf1f6-ef38-4527-b011-78ff64c23d29','4d428e98-6888-4433-82ea-6fc44340d6d8','Deadlift',2,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b420e22e-caef-4451-9de7-241f4cbbdb15','4d428e98-6888-4433-82ea-6fc44340d6d8','Deadlift',3,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6400ce77-1ee8-432d-8856-169da4514cbe','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Squat',1,170.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('0c81d6bf-19e0-467d-bd5d-54150fbf9c6e','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Squat',2,187.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6c589f7a-3528-4655-bb2f-b1725c11df17','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Squat',3,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b4fac431-5f70-410a-b465-b955e7517870','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Bench',1,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('eacda1f7-3e94-4245-942e-f67ae93711e3','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Bench',2,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('23a7245d-479f-42fb-b3d5-d4c2e5792c3e','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Bench',3,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b33617b4-991f-4bed-9bc3-305aec2e62db','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Deadlift',1,210.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('c5c23276-46a0-423d-8ccc-a0000644b983','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Deadlift',2,220.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('98410655-4a5b-4070-b9d0-4917e73a8935','5b0b4daa-322f-47d0-8e39-8aaad64f6a5d','Deadlift',3,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('dde5e1db-ead0-40ab-a5ff-b44bb707608e','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Squat',1,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('a3001c15-af5b-44c5-b6a3-7e76581b76ba','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Squat',2,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('a6878a46-5b58-483d-b090-8405278ddcee','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Squat',3,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('3005d167-de47-4ce1-bf0a-4be8e89db04f','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Bench',1,45.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('1f6fc59c-c441-458f-9df1-604790113242','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Bench',2,55.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('14a53086-710f-4c24-a3fd-6de4904f47d3','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Bench',3,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('a0773b10-8d10-4a54-b5a9-c50a2d17308c','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Deadlift',1,105.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('691bfab0-f38a-459e-b479-d09f0408f88e','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Deadlift',2,119.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('cc9bae4a-6de1-4f61-b04a-f6521ee25395','b3d57060-62f8-46c8-a1b3-fde17c7c6793','Deadlift',3,125.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('67dae238-0e23-48e5-8c12-d2a3c0bbb78c','61d0d6f4-1be1-4119-8523-29bd8ec66144','Squat',1,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('2d89de36-6ad2-4ff1-a33c-f0eb339b9353','61d0d6f4-1be1-4119-8523-29bd8ec66144','Squat',2,200.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('d8cefc82-2612-49c3-bd41-eab3292c6aa6','61d0d6f4-1be1-4119-8523-29bd8ec66144','Squat',3,210.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('35d9f76f-10ee-420b-b63f-94a9d1145c1a','61d0d6f4-1be1-4119-8523-29bd8ec66144','Bench',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('9e395a74-da49-4bf1-a234-ebcd1aba9bf9','61d0d6f4-1be1-4119-8523-29bd8ec66144','Bench',2,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('ffd42ca1-1a50-448b-875a-34f67d2ba303','61d0d6f4-1be1-4119-8523-29bd8ec66144','Bench',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('24bf66cb-7168-412b-88bf-38418824f6f4','61d0d6f4-1be1-4119-8523-29bd8ec66144','Deadlift',1,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('ce3280e7-6e56-434a-aa69-bcb35f51061c','61d0d6f4-1be1-4119-8523-29bd8ec66144','Deadlift',2,240.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('830e024a-f7cb-4544-92c7-6199b2807095','61d0d6f4-1be1-4119-8523-29bd8ec66144','Deadlift',3,250.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('eabc6c43-c19e-472a-b8c3-c4a8aaaa402a','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Squat',1,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('842a4abb-7e5f-429f-a02f-21db77aaeecb','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Squat',2,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('44c81873-f579-4159-b944-9a3029528eb9','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Squat',3,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('0e03ae3a-7072-49f6-8c3d-dcc7fc4fc37b','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Bench',1,70.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('8149d44a-e5c8-4b92-b715-5b4a2335cb3d','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Bench',2,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('89d2d9d2-c06d-4c96-91cf-24dff13ef8db','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Bench',3,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6f579d2b-5597-4e14-9a30-5349a145bbe3','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Deadlift',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('91fc555f-9248-4050-b116-811b07f06113','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Deadlift',2,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('ed6f4368-978f-48e3-9a84-01be5a734bef','4fd37916-bbae-40cd-b4d7-8373a2a5aa6c','Deadlift',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('16b2b083-d1b3-4ced-9fa8-4ef920656dcc','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Squat',1,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('3356e487-9efd-4321-99fd-b1b855cc26b7','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Squat',2,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('aafcab3c-8c3b-4579-9812-9e524e2162c3','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Squat',3,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('5e422c4b-6005-4531-89d8-f2a9d8ce6a74','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Bench',1,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('559dde7d-0f8e-4aaa-bdf3-b5edf9f167da','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Bench',2,85.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('2b5ea819-d924-4299-909d-b0b0986ea910','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Bench',3,95.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6b8db167-35cc-4ffb-b3ee-85cf4db8be8c','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Deadlift',1,145.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('7a14acb6-8c8c-4f60-9a95-da73992acb6f','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Deadlift',2,155.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('a8fcb83b-c892-43ec-869a-c34eeca94faa','8f2c1ce5-f66b-4eed-bccf-3de11e47c0cf','Deadlift',3,165.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('b2b2d253-c1d8-43b5-a5e8-c5447285171e','00226901-18ac-482c-ac1a-db687cf05951','Squat',1,95.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('14087fe5-673a-41f4-90d0-e0567a0a118e','00226901-18ac-482c-ac1a-db687cf05951','Squat',2,105.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('c3f71e2c-158b-42c0-991b-5cdc3d87be9b','00226901-18ac-482c-ac1a-db687cf05951','Squat',3,115.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6facbf1b-89c3-4ea2-8431-79679f12a149','00226901-18ac-482c-ac1a-db687cf05951','Bench',1,60.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('43834f8f-96ce-4657-88a4-4d3fa034850a','00226901-18ac-482c-ac1a-db687cf05951','Bench',2,70.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('16308371-2a3c-4f8b-90c4-4bec86d5f875','00226901-18ac-482c-ac1a-db687cf05951','Bench',3,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('e837fe5a-081c-404b-89f7-c5bf4c562098','00226901-18ac-482c-ac1a-db687cf05951','Deadlift',1,125.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('f3647a0d-1a81-4e9b-9d07-12465fd15acc','00226901-18ac-482c-ac1a-db687cf05951','Deadlift',2,135.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('0ac8299d-44bd-4e50-9313-9dc9916654bb','00226901-18ac-482c-ac1a-db687cf05951','Deadlift',3,145.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('f85caa91-728d-47af-8309-8d9027294054','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Squat',1,220.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('95d6166f-8bbd-42dd-91c7-34d65a922104','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Squat',2,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('52a05cb4-1884-4af1-9bb3-deca74d178c8','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Squat',3,240.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('400d3e78-f190-4ee1-a755-81474d6e522c','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Bench',1,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('bd952ccf-2b3b-4900-b814-d73eda7e6bc7','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Bench',2,170.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('38549593-fa0b-4699-966e-d631aaec85c3','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Bench',3,180.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('eeb73ed1-3b70-472a-82a6-0b66e1a85484','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Deadlift',1,260.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('35421bc5-82d1-4385-a786-65386b4ee18a','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Deadlift',2,270.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('f17cbd8c-db23-4201-9177-52d6455aebf0','1f243f5a-31cc-47f9-ab5d-909afb5095bf','Deadlift',3,280.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('72091d74-af48-4b45-a65b-00025d785416','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Squat',1,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('d9980dfa-9c52-40d7-b409-0df6a9896e58','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Squat',2,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('6758b5ea-45c4-4b68-864a-dcebd0521238','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Squat',3,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('e5cc6e71-a0cd-4279-bb96-17a32120c26f','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Bench',1,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('c0e04d93-1082-46f9-861c-7b6ad0b931ef','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Bench',2,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('97585643-b356-4d24-842c-0d0d4bd6edf8','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Bench',3,85.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('1fd5c180-4d32-4397-9bac-f66b0c29d40c','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Deadlift',1,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('74c2fa36-6919-4987-a880-0279d213e2e5','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Deadlift',2,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('24faa7bd-e12d-475e-b386-ccafd4cfcd46','ec969c7a-004b-4643-a3e7-ace1e484c2e1','Deadlift',3,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:14');
INSERT INTO attempts VALUES('3ad711a8-6c80-4d5f-932f-6f41d4d58ac5','417517fd-d65b-4d42-95ac-c188f0d10d93','Squat',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('6faf8f27-97ac-4529-ae6d-5b294053b0b8','417517fd-d65b-4d42-95ac-c188f0d10d93','Squat',2,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('fb1696ab-7b30-4d48-8db4-d07c529e5f0e','417517fd-d65b-4d42-95ac-c188f0d10d93','Squat',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('30135873-bd8b-4b3c-806c-c8276471c0db','417517fd-d65b-4d42-95ac-c188f0d10d93','Bench',1,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('8274493d-9e0c-4f27-9b9a-2fa079e37661','417517fd-d65b-4d42-95ac-c188f0d10d93','Bench',2,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('98de502b-60dd-4b79-8b19-3a0ad23de86a','417517fd-d65b-4d42-95ac-c188f0d10d93','Bench',3,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('2297988a-21ca-44c3-bab2-cb61ce55f09a','417517fd-d65b-4d42-95ac-c188f0d10d93','Deadlift',1,180.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('bf9e98b7-9b3c-47e0-80ee-d9214be38a75','417517fd-d65b-4d42-95ac-c188f0d10d93','Deadlift',2,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('fdba0545-644b-4f2d-b1e8-cf287faec91a','417517fd-d65b-4d42-95ac-c188f0d10d93','Deadlift',3,200.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('07c3d6cc-a1f7-4a99-8e51-6e1a864a2a29','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Squat',1,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('e5c4c33c-8c9d-46ef-abcc-8ae0d77218c6','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Squat',2,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('856d5de1-c82b-43ea-ab0d-56b711c25170','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Squat',3,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('8788fd1e-15f7-40da-b57f-9f785cf3f1f9','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Bench',1,55.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('064dc84f-fedb-4606-8d65-8920b0b9a8f5','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Bench',2,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('76416eae-ff76-452e-aa5e-fca5075f6fb8','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Bench',3,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('2f7ba15b-b03b-45c5-b232-95c2e5e8503d','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Deadlift',1,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('02256f31-b74d-4504-895e-876a24bdb99d','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Deadlift',2,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('96f88f8a-72e5-4ab3-9aa7-556357a28374','6e4eaab0-e0f3-4a52-ba15-3b02aaa7ee9e','Deadlift',3,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('801b0331-7e5e-4d92-9568-92a8a665539c','8fe968f3-491e-4fe7-be33-77268bd9f473','Squat',1,170.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('1bca8676-d9a8-45b9-9df7-ed45815c3892','8fe968f3-491e-4fe7-be33-77268bd9f473','Squat',2,180.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('a62a6c84-0eab-4b46-8364-a9596b89735c','8fe968f3-491e-4fe7-be33-77268bd9f473','Squat',3,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('aab9e5f3-1e40-47e8-9d8c-76179ecfc8d2','8fe968f3-491e-4fe7-be33-77268bd9f473','Bench',1,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('3073ce81-e0c6-466b-8c4e-244a95d7201d','8fe968f3-491e-4fe7-be33-77268bd9f473','Bench',2,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('f54294e4-f721-4de2-bcfc-a5763a8440e5','8fe968f3-491e-4fe7-be33-77268bd9f473','Bench',3,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('b02a694b-d925-4c4c-b01b-2c930b105649','8fe968f3-491e-4fe7-be33-77268bd9f473','Deadlift',1,210.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('800ef806-936a-48d5-a7cf-664dcc32c957','8fe968f3-491e-4fe7-be33-77268bd9f473','Deadlift',2,220.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('25f9ac11-82ce-4176-b3e7-0320dc617280','8fe968f3-491e-4fe7-be33-77268bd9f473','Deadlift',3,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('f1a00be3-c302-4895-a4df-99485e80afc0','122dfe3e-f668-4695-af20-4cec787b0316','Squat',1,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('d78a1e7e-e47f-4d15-bd5a-a5963819befd','122dfe3e-f668-4695-af20-4cec787b0316','Squat',2,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('e9ecbe6d-6174-4a49-b97d-4e5c01cc3db8','122dfe3e-f668-4695-af20-4cec787b0316','Squat',3,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('1aeb4abe-e403-4932-a884-692c0be48768','122dfe3e-f668-4695-af20-4cec787b0316','Bench',1,45.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('c771bcd1-ca0e-4177-9f5d-e718a0b5300b','122dfe3e-f668-4695-af20-4cec787b0316','Bench',2,55.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('11c2582b-13fd-4c53-a09a-e211b2c159cf','122dfe3e-f668-4695-af20-4cec787b0316','Bench',3,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('41c59d46-4a57-4e86-a403-9d672028e800','122dfe3e-f668-4695-af20-4cec787b0316','Deadlift',1,105.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('80493e74-a30d-4b38-9533-2f10c9072a48','122dfe3e-f668-4695-af20-4cec787b0316','Deadlift',2,115.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('5999ebe7-d213-4eea-b004-8d736122480e','122dfe3e-f668-4695-af20-4cec787b0316','Deadlift',3,125.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('5bf302d6-f5cd-4da4-890c-959cfefefd07','9b22c7cc-58fd-43c6-b930-ba031782edf7','Squat',1,190.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('379e70a6-42ae-4a8c-b089-c159fd54dc83','9b22c7cc-58fd-43c6-b930-ba031782edf7','Squat',2,200.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('9aa86396-1239-42e6-9737-72681f17db84','9b22c7cc-58fd-43c6-b930-ba031782edf7','Squat',3,210.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('c62a0c3b-8e2c-4161-a392-f082e2abffda','9b22c7cc-58fd-43c6-b930-ba031782edf7','Bench',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('ae80f2a6-da22-4f88-a0f9-52d20995f56a','9b22c7cc-58fd-43c6-b930-ba031782edf7','Bench',2,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('fb89378c-bde8-4f8d-baeb-6909be7839bd','9b22c7cc-58fd-43c6-b930-ba031782edf7','Bench',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('56bdfe23-20dd-4846-b4a7-d999e42eeda2','9b22c7cc-58fd-43c6-b930-ba031782edf7','Deadlift',1,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('607b1d8d-1dfc-48cc-9144-5e7db9d1fe00','9b22c7cc-58fd-43c6-b930-ba031782edf7','Deadlift',2,240.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('315f4e6a-ac2d-44ac-9cf0-3a6259584d20','9b22c7cc-58fd-43c6-b930-ba031782edf7','Deadlift',3,250.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('12688c42-235a-41cc-bec1-c1a397eb5f74','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Squat',1,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('c770709a-2cd7-4ece-be7b-53b9a77b25bc','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Squat',2,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('7f81d73f-9606-444b-9e67-c3d2e47982f8','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Squat',3,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('38afebd9-23cf-4a5f-b54f-94c34edb856b','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Bench',1,70.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('ae89d97c-850f-4d95-b990-8119493f057b','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Bench',2,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('de1e638f-bb3d-4fef-a983-8163cbeb7671','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Bench',3,90.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('7b879923-a1aa-403b-9548-a898cb8222f9','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Deadlift',1,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('f763a4d0-410d-4ef2-942e-a54f24d77219','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Deadlift',2,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('29598cb6-72a1-406a-b4c1-498166b7aeca','752dbab1-492f-4ac3-9f0b-e5771d54fedc','Deadlift',3,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('a388b9e7-a38b-46bb-b908-1f2514aa9c09','e65e392a-6f1d-4489-b997-b69d773449e0','Squat',1,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('9ceff1f3-51e5-42d0-b7a3-6291445a91bf','e65e392a-6f1d-4489-b997-b69d773449e0','Squat',2,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('fd655930-f046-4dbb-b193-98df7c363af5','e65e392a-6f1d-4489-b997-b69d773449e0','Squat',3,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('21ca91f9-1647-4c66-acd7-89ad7cff49ed','e65e392a-6f1d-4489-b997-b69d773449e0','Bench',1,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('63b588d9-ecd9-4a7d-a092-697fe7e3bb3f','e65e392a-6f1d-4489-b997-b69d773449e0','Bench',2,85.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('39a4c4b9-9f1d-4acc-9749-2657aa01d4a3','e65e392a-6f1d-4489-b997-b69d773449e0','Bench',3,95.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('8d566966-bd5d-4592-a21c-a8b050c65081','e65e392a-6f1d-4489-b997-b69d773449e0','Deadlift',1,145.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('3b92b18b-2ea3-4fb6-8f57-608451124c72','e65e392a-6f1d-4489-b997-b69d773449e0','Deadlift',2,155.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('bca8cf1f-4486-4735-bacd-caa9274f3b75','e65e392a-6f1d-4489-b997-b69d773449e0','Deadlift',3,165.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('878d62fe-a76b-41c6-804b-ea0779df47ea','265a5c8c-1e97-40b2-b351-86fc9328bc78','Squat',1,95.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('d3ceb23a-eb70-404a-a094-44f6b1333a12','265a5c8c-1e97-40b2-b351-86fc9328bc78','Squat',2,105.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('b5660917-d496-439f-abb9-549bc02bec0c','265a5c8c-1e97-40b2-b351-86fc9328bc78','Squat',3,115.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('e10af5d5-83d6-499e-b981-8099a4223c91','265a5c8c-1e97-40b2-b351-86fc9328bc78','Bench',1,60.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('2515b91b-81b9-421d-b290-411d7c8220b3','265a5c8c-1e97-40b2-b351-86fc9328bc78','Bench',2,70.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('cb8d90f6-976d-4b0e-bd0b-e4e2bc86e543','265a5c8c-1e97-40b2-b351-86fc9328bc78','Bench',3,80.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('c1ad3fd3-c5f6-41e1-9004-db9113f4a1cc','265a5c8c-1e97-40b2-b351-86fc9328bc78','Deadlift',1,125.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('d731e126-1a08-449b-a5b9-840e38a5a3d8','265a5c8c-1e97-40b2-b351-86fc9328bc78','Deadlift',2,135.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('fcbb3e26-ebab-44ee-9556-6309461d8992','265a5c8c-1e97-40b2-b351-86fc9328bc78','Deadlift',3,145.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('a1121eba-c074-47d2-835b-b08c04a2e52a','56b25440-bb63-4f41-95f8-635a7a58a406','Squat',1,220.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('737b7740-aafb-40e0-8a79-9164b2e1599d','56b25440-bb63-4f41-95f8-635a7a58a406','Squat',2,230.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('ba695bf6-0ebe-4133-a9ed-ea59463dafe4','56b25440-bb63-4f41-95f8-635a7a58a406','Squat',3,240.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('bd9b205c-f852-4645-8636-808db216d874','56b25440-bb63-4f41-95f8-635a7a58a406','Bench',1,160.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('0c405509-14e8-4b8d-8eae-ddddd680c0b7','56b25440-bb63-4f41-95f8-635a7a58a406','Bench',2,170.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('620181b9-ad32-4b7e-86c4-dd1b4055c5b1','56b25440-bb63-4f41-95f8-635a7a58a406','Bench',3,180.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('b506fd49-a50c-4266-8d66-5eec11c60efb','56b25440-bb63-4f41-95f8-635a7a58a406','Deadlift',1,260.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('8aff0fa9-b91a-4218-8159-8ec02caebe67','56b25440-bb63-4f41-95f8-635a7a58a406','Deadlift',2,270.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('bf19a7b6-384d-425b-a057-cb3faadd7017','56b25440-bb63-4f41-95f8-635a7a58a406','Deadlift',3,280.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('1ed18bf1-506e-4232-b37f-6b60e597d338','efbd93fd-8362-49b8-81c2-4decb0c11f78','Squat',1,100.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('d1355a4f-66b3-4aba-b462-8e60d6f60d6f','efbd93fd-8362-49b8-81c2-4decb0c11f78','Squat',2,110.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('b7b9d76e-e421-48aa-8aa5-be12b1114803','efbd93fd-8362-49b8-81c2-4decb0c11f78','Squat',3,120.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('38213574-5205-49e1-880e-dbf8c14fa354','efbd93fd-8362-49b8-81c2-4decb0c11f78','Bench',1,65.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('2a0f5143-4848-44c9-a4bf-d6dc3f5fdedb','efbd93fd-8362-49b8-81c2-4decb0c11f78','Bench',2,75.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('b07b9d07-5753-459d-9366-99182a81d385','efbd93fd-8362-49b8-81c2-4decb0c11f78','Bench',3,85.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('23dbe574-af47-40ac-92bf-15a20f78dbb4','efbd93fd-8362-49b8-81c2-4decb0c11f78','Deadlift',1,130.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('17d93558-d85e-483d-aab4-53904471709d','efbd93fd-8362-49b8-81c2-4decb0c11f78','Deadlift',2,140.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
INSERT INTO attempts VALUES('dfa13928-06d5-487e-bae3-ea8c20f5bd5d','efbd93fd-8362-49b8-81c2-4decb0c11f78','Deadlift',3,150.0,'Pending',NULL,NULL,NULL,NULL,NULL,'2025-09-01 22:02:34');
CREATE TABLE current_lifts (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one current lift at a time
    contest_id TEXT NOT NULL,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1,2,3,4)),
    weight REAL NOT NULL,
    timer_start TEXT, -- ISO 8601 timestamp when timer started
    timer_duration INTEGER NOT NULL DEFAULT 60, -- Timer duration in seconds
    rack_height INTEGER, -- Current rack height setting
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Whether lift is currently happening
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);
CREATE TABLE results (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL, -- Changed from competitor_id to registration_id
    contest_id TEXT NOT NULL,
    
    -- Best lifts for each discipline
    best_bench REAL DEFAULT 0,
    best_squat REAL DEFAULT 0,
    best_deadlift REAL DEFAULT 0,
    total_weight REAL NOT NULL DEFAULT 0, -- Sum of best lifts
    coefficient_points REAL NOT NULL DEFAULT 0, -- total_weight * reshel * mccullough
    
    -- Multiple ranking support (based on CSV files)
    place_open INTEGER, -- Overall ranking (OPEN.csv)
    place_in_age_class INTEGER, -- Ranking within age category (KATEGORIE WIEKOWE.csv)
    place_in_weight_class INTEGER, -- Ranking within weight class (KATEGORIE WAGOWE.csv)
    
    -- Competition flags
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT,
    
    -- Record tracking
    broke_record BOOLEAN NOT NULL DEFAULT FALSE,
    record_type TEXT, -- 'Personal', 'Club', 'Regional', 'National', 'World'
    
    -- Timestamps
    calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    UNIQUE(registration_id) -- One result per registration
);
CREATE TABLE contest_states (
    contest_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Setup',
    current_lift TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);
CREATE TABLE plate_sets (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    plate_weight REAL NOT NULL,  -- Weight of single plate in kg
    quantity INTEGER NOT NULL,    -- Number of pairs available
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contest_id, plate_weight)
);
CREATE TRIGGER update_competitors_timestamp 
    AFTER UPDATE ON competitors
    BEGIN
        UPDATE competitors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
CREATE TRIGGER update_current_lifts_timestamp 
    AFTER UPDATE ON current_lifts
    BEGIN
        UPDATE current_lifts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
CREATE TRIGGER update_contests_timestamp 
    AFTER UPDATE ON contests
    BEGIN
        UPDATE contests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
CREATE INDEX idx_registrations_contest ON registrations(contest_id);
CREATE INDEX idx_registrations_competitor ON registrations(competitor_id);
CREATE INDEX idx_registrations_age_category ON registrations(age_category_id);
CREATE INDEX idx_registrations_weight_class ON registrations(weight_class_id);
CREATE INDEX idx_attempts_registration ON attempts(registration_id);
CREATE INDEX idx_attempts_lift_type ON attempts(lift_type);
CREATE INDEX idx_results_contest ON results(contest_id);
CREATE INDEX idx_results_registration ON results(registration_id);
CREATE INDEX idx_competitors_has_photo ON competitors(photo_data IS NOT NULL);
CREATE INDEX idx_competitors_photo_format ON competitors(photo_format);
CREATE UNIQUE INDEX idx_competitors_competition_order_unique ON competitors(competition_order);
CREATE INDEX idx_competitors_competition_order ON competitors(competition_order);
CREATE INDEX idx_plate_sets_contest_id ON plate_sets(contest_id);
CREATE INDEX idx_plate_sets_weight ON plate_sets(plate_weight);
COMMIT;
