INSERT INTO projects (id, name, code, sort_order) VALUES
  ('project-alpha', 'Платформа аналитики', 'ANL', 0),
  ('project-beta', 'Мобильное приложение', 'MOB', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO requirement_types (id, name, sort_order) VALUES
  ('functional', 'Функциональное', 0),
  ('non-functional', 'Нефункциональное', 1),
  ('security', 'Безопасность', 2),
  ('integration', 'Интеграционное', 3),
  ('use-case', 'Сценарий использования', 4),
  ('user-story', 'Пользовательская история', 5),
  ('business-requirement', 'Бизнес требование', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO requirement_link_types (id, name, directed, sort_order) VALUES
  ('link-clarifies', 'Уточняет', true, 0),
  ('link-based-on', 'Основано на', true, 1),
  ('link-depends-on', 'Зависит от', true, 2),
  ('link-conflicts-with', 'Конфликтует с', false, 3),
  ('link-duplicates', 'Дублирует', false, 4),
  ('link-related-to', 'Связано с', false, 5)
ON CONFLICT (id) DO NOTHING;
