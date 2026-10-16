-- P1: guided professional profile, configurable reference domains and private evidence portfolio.
ALTER TABLE reference_dataset DROP CONSTRAINT IF EXISTS reference_dataset_domain_check;
ALTER TABLE reference_dataset ADD CONSTRAINT reference_dataset_domain_check CHECK (domain IN (
  'geography','occupation','industry','education_level','qualification_type','field_of_study',
  'membership','verification','nationality','language','institution','experience_range'
));
ALTER TABLE professional_profile_reference DROP CONSTRAINT IF EXISTS professional_profile_reference_relation_type_check;
ALTER TABLE professional_profile_reference ADD CONSTRAINT professional_profile_reference_relation_type_check CHECK (relation_type IN (
  'occupation','industry','education_level','qualification_type','field_of_study','skill','language','specialization','nationality','institution','experience_range'
));

CREATE TABLE IF NOT EXISTS professional_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES professional_profile(id) ON DELETE RESTRICT,
  education_level_item_id uuid NOT NULL REFERENCES reference_item(id) ON DELETE RESTRICT,
  institution_item_id uuid REFERENCES reference_item(id) ON DELETE RESTRICT,
  institution_name_custom text,
  field_of_study_item_id uuid REFERENCES reference_item(id) ON DELETE RESTRICT,
  field_of_study_custom text,
  qualification_item_id uuid REFERENCES reference_item(id) ON DELETE RESTRICT,
  qualification_custom text,
  graduation_year integer CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1900 AND 2100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (institution_item_id IS NOT NULL OR nullif(trim(institution_name_custom),'') IS NOT NULL),
  CHECK (field_of_study_item_id IS NOT NULL OR nullif(trim(field_of_study_custom),'') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_professional_education_profile ON professional_education(profile_id, graduation_year DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS professional_portfolio_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES professional_profile(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  item_type text NOT NULL CHECK (item_type IN ('project','publication','case_study','certificate','work_sample','other')),
  description text,
  external_url text,
  evidence_file_id uuid REFERENCES file_object(id) ON DELETE RESTRICT,
  evidence_label text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','members','public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (external_url IS NULL OR external_url ~ '^https://'),
  CHECK (evidence_label IS NULL OR length(evidence_label) <= 180)
);
CREATE INDEX IF NOT EXISTS ix_professional_portfolio_profile ON professional_portfolio_item(profile_id, created_at DESC);

-- Admin-editable reference sets. These are versioned through the existing reference portfolio model.
INSERT INTO reference_dataset(dataset_key,name,description,domain,source_type,source_name,status)
VALUES
 ('professional_nationalities','Nationalities','Selectable nationality values for professional profiles.','nationality','mpa_governed','MPA','active'),
 ('professional_occupations','Occupations','Selectable occupations for professional profiles.','occupation','mpa_governed','MPA','active'),
 ('professional_industries','Industries','Selectable industries for professional profiles.','industry','mpa_governed','MPA','active'),
 ('professional_fields_of_study','Fields of study','Selectable fields of study for education records.','field_of_study','mpa_governed','MPA','active'),
 ('professional_experience_ranges','Experience ranges','Guided experience ranges for professional profiles.','experience_range','mpa_governed','MPA','active'),
 ('professional_languages','Languages','Selectable spoken and professional languages.','language','mpa_governed','MPA','active'),
 ('professional_qualifications','Qualifications','Selectable qualification and credential types.','qualification_type','mpa_governed','MPA','active'),
 ('professional_education_levels','Education levels','Selectable education levels for education records.','education_level','mpa_governed','MPA','active'),
 ('professional_institutions','Institutions','Selectable schools, colleges, universities and training institutions.','institution','mpa_governed','MPA','active')
ON CONFLICT(dataset_key) DO NOTHING;

WITH missing AS (
 SELECT d.id,d.dataset_key FROM reference_dataset d
 WHERE d.dataset_key IN ('professional_nationalities','professional_occupations','professional_industries','professional_fields_of_study','professional_experience_ranges','professional_languages','professional_qualifications','professional_education_levels','professional_institutions')
 AND NOT EXISTS (SELECT 1 FROM reference_dataset_version v WHERE v.dataset_id=d.id AND v.status='published')
), versions AS (
 INSERT INTO reference_dataset_version(dataset_id,version_label,status,import_method,notes,published_at)
 SELECT id,'p1-baseline','published','manual','Initial guided-profile reference set; administrators may extend via the Reference Portfolio UI.',now() FROM missing
 ON CONFLICT(dataset_id,version_label) DO UPDATE SET status='published',published_at=coalesce(reference_dataset_version.published_at,now())
 RETURNING id,dataset_id
)
INSERT INTO reference_item(dataset_version_id,code,label,sort_order,active)
SELECT v.id,seed.code,seed.label,seed.ord,true
FROM versions v
JOIN reference_dataset d ON d.id=v.dataset_id
JOIN LATERAL (
 VALUES
 ('professional_nationalities','ET','Ethiopian',10),
 ('professional_nationalities','OTHER','Other',999),
 ('professional_occupations','OTHER','Other',999),
 ('professional_industries','OTHER','Other',999),
 ('professional_fields_of_study','OTHER','Other',999),
 ('professional_experience_ranges','EXP_0_1','Less than 1 year',10),
 ('professional_experience_ranges','EXP_1_3','1–3 years',20),
 ('professional_experience_ranges','EXP_4_6','4–6 years',30),
 ('professional_experience_ranges','EXP_7_10','7–10 years',40),
 ('professional_experience_ranges','EXP_11_PLUS','11+ years',50),
 ('professional_experience_ranges','OTHER','Other',999),
 ('professional_languages','AM','Amharic',10),
 ('professional_languages','OM','Afaan Oromoo',20),
 ('professional_languages','EN','English',30),
 ('professional_languages','AR','Arabic',40),
 ('professional_languages','OTHER','Other',999),
 ('professional_qualifications','CERTIFICATE','Certificate',10),
 ('professional_qualifications','DIPLOMA','Diploma',20),
 ('professional_qualifications','DEGREE','Degree',30),
 ('professional_qualifications','LICENSE','Professional license',40),
 ('professional_qualifications','PRO_CERT','Professional certification',50),
 ('professional_qualifications','OTHER','Other',999),
 ('professional_education_levels','SECONDARY','Secondary education',10),
 ('professional_education_levels','CERTIFICATE','Certificate',20),
 ('professional_education_levels','DIPLOMA','Diploma',30),
 ('professional_education_levels','UNDERGRADUATE','Undergraduate degree',40),
 ('professional_education_levels','POSTGRADUATE','Postgraduate diploma',50),
 ('professional_education_levels','MASTERS','Master’s degree',60),
 ('professional_education_levels','DOCTORATE','Doctorate',70),
 ('professional_education_levels','VOCATIONAL','Vocational/technical',80),
 ('professional_education_levels','OTHER','Other',999),
 ('professional_institutions','OTHER','Other',999),
 ('professional_nationalities','KE','Kenyan',20),
 ('professional_nationalities','SO','Somali',30),
 ('professional_nationalities','ER','Eritrean',40),
 ('professional_nationalities','SD','Sudanese',50),
 ('professional_occupations','ACCOUNTANT','Accountant',10),
 ('professional_occupations','SOFTWARE_DEVELOPER','Software developer',20),
 ('professional_occupations','ENGINEER','Engineer',30),
 ('professional_occupations','TEACHER','Teacher / educator',40),
 ('professional_occupations','HEALTHCARE','Healthcare professional',50),
 ('professional_occupations','LAWYER','Lawyer / legal professional',60),
 ('professional_occupations','PROJECT_MANAGER','Project manager',70),
 ('professional_occupations','RESEARCHER','Researcher',80),
 ('professional_occupations','BUSINESS_OWNER','Business owner',90),
 ('professional_industries','AGRICULTURE','Agriculture',10),
 ('professional_industries','EDUCATION','Education',20),
 ('professional_industries','HEALTH','Health and social care',30),
 ('professional_industries','ICT','Information and communication technology',40),
 ('professional_industries','FINANCE','Finance and insurance',50),
 ('professional_industries','CONSTRUCTION','Construction and engineering',60),
 ('professional_industries','NONPROFIT','Nonprofit and community development',70),
 ('professional_industries','MANUFACTURING','Manufacturing',80),
 ('professional_industries','RETAIL','Retail and commerce',90),
 ('professional_industries','PUBLIC_ADMIN','Public administration',100),
 ('professional_fields_of_study','BUSINESS','Business and management',10),
 ('professional_fields_of_study','COMPUTER_SCIENCE','Computer science and IT',20),
 ('professional_fields_of_study','ENGINEERING','Engineering',30),
 ('professional_fields_of_study','HEALTH_SCIENCES','Health sciences',40),
 ('professional_fields_of_study','EDUCATION','Education',50),
 ('professional_fields_of_study','LAW','Law',60),
 ('professional_fields_of_study','AGRICULTURE','Agriculture',70),
 ('professional_fields_of_study','ECONOMICS','Economics',80),
 ('professional_fields_of_study','SOCIAL_SCIENCES','Social sciences',90),
 ('professional_fields_of_study','ISLAMIC_STUDIES','Islamic studies',100),
 ('professional_languages','TI','Tigrinya',50),
 ('professional_languages','SO','Somali',60),
 ('professional_education_levels','PRIMARY','Primary education',5),
 ('professional_education_levels','TVET','TVET / technical education',75),
 ('professional_qualifications','MASTERS','Master’s degree',60),
 ('professional_qualifications','DOCTORATE','Doctorate',70)
 ) AS seed(dataset_key,code,label,ord) ON seed.dataset_key=d.dataset_key
ON CONFLICT(dataset_version_id,code) DO NOTHING;

COMMENT ON TABLE professional_education IS 'Structured education records linked to governed reference values; free-text is accepted only when the user selects Other.';
COMMENT ON TABLE professional_portfolio_item IS 'Multiple traceable professional portfolio entries; linked evidence remains private and is never included in public profile projections.';
