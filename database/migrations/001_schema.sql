CREATE TABLE projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE requirement_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX projects_name_lower_idx ON projects(lower(name));
CREATE UNIQUE INDEX projects_code_lower_idx ON projects(lower(code));
CREATE UNIQUE INDEX requirement_types_name_lower_idx ON requirement_types(lower(name));

CREATE TABLE users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('Администратор', 'Пользователь')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE user_project_permissions (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  can_create boolean NOT NULL DEFAULT false,
  can_read boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX user_project_permissions_project_idx ON user_project_permissions(project_id);

CREATE TABLE requirement_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (id, project_id),
  CONSTRAINT requirement_groups_parent_same_project
    FOREIGN KEY (parent_id, project_id)
    REFERENCES requirement_groups(id, project_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX requirement_groups_project_idx ON requirement_groups(project_id);
CREATE INDEX requirement_groups_parent_idx ON requirement_groups(parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE requirements (
  id text PRIMARY KEY,
  number text NOT NULL,
  description text NOT NULL,
  details_markdown text NOT NULL DEFAULT '',
  type_id text NOT NULL REFERENCES requirement_types(id) ON DELETE RESTRICT,
  priority text NOT NULL,
  complexity text NOT NULL DEFAULT '',
  status text NOT NULL,
  release text NOT NULL DEFAULT '',
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (id, project_id),
  UNIQUE (project_id, number),
  CONSTRAINT requirements_group_same_project
    FOREIGN KEY (group_id, project_id)
    REFERENCES requirement_groups(id, project_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX requirements_project_type_idx ON requirements(project_id, type_id);
CREATE INDEX requirements_project_status_idx ON requirements(project_id, status);
CREATE INDEX requirements_group_idx ON requirements(group_id) WHERE group_id IS NOT NULL;

CREATE TABLE requirement_prefixes (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type_id text NOT NULL REFERENCES requirement_types(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  PRIMARY KEY (project_id, type_id)
);

CREATE TABLE requirement_link_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  directed boolean NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX requirement_link_types_name_lower_idx ON requirement_link_types(lower(name));

CREATE TABLE requirement_links (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_a_id text NOT NULL,
  requirement_b_id text NOT NULL,
  type_id text NOT NULL REFERENCES requirement_link_types(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  CHECK (requirement_a_id <> requirement_b_id),
  FOREIGN KEY (requirement_a_id, project_id)
    REFERENCES requirements(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (requirement_b_id, project_id)
    REFERENCES requirements(id, project_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX requirement_links_pair_idx
  ON requirement_links(LEAST(requirement_a_id, requirement_b_id), GREATEST(requirement_a_id, requirement_b_id));
CREATE INDEX requirement_links_project_idx ON requirement_links(project_id);

CREATE TABLE data_imports (
  fingerprint text PRIMARY KEY,
  source text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
