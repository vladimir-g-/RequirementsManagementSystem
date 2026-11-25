CREATE TABLE requirement_statuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE requirement_priorities (
  id text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE requirement_complexities (
  id text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX requirement_statuses_name_lower_idx ON requirement_statuses(lower(name));
CREATE UNIQUE INDEX requirement_priorities_name_lower_idx ON requirement_priorities(lower(name));
CREATE UNIQUE INDEX requirement_complexities_name_lower_idx ON requirement_complexities(lower(name));

INSERT INTO requirement_statuses (id, name, sort_order) VALUES
  ('draft', 'Черновик', 0),
  ('in-progress', 'В работе', 1),
  ('under-review', 'На проверке', 2),
  ('pending-approval', 'На согласовании', 3),
  ('approved', 'Согласовано', 4),
  ('canceled', 'Отменено', 5),
  ('done', 'Готово', 6),
  ('planned', 'Запланировано', 7);

INSERT INTO requirement_priorities (id, name, sort_order) VALUES
  ('critical', 'Критическая', 0),
  ('high', 'Высокая', 1),
  ('medium', 'Средняя', 2),
  ('low', 'Низкая', 3);

INSERT INTO requirement_complexities (id, name, sort_order) VALUES
  ('low', 'Низкая', 0),
  ('medium', 'Средняя', 1),
  ('high', 'Высокая', 2);

ALTER TABLE requirements ALTER COLUMN complexity DROP NOT NULL;
ALTER TABLE requirements ALTER COLUMN complexity DROP DEFAULT;
UPDATE requirements SET complexity = NULL WHERE complexity = '';

ALTER TABLE requirements
  ADD CONSTRAINT requirements_status_fk
  FOREIGN KEY (status) REFERENCES requirement_statuses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT requirements_priority_fk
  FOREIGN KEY (priority) REFERENCES requirement_priorities(id) ON DELETE RESTRICT,
  ADD CONSTRAINT requirements_complexity_fk
  FOREIGN KEY (complexity) REFERENCES requirement_complexities(id) ON DELETE RESTRICT;
