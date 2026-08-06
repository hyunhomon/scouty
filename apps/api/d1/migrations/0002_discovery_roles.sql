ALTER TABLE discovery_portfolios
ADD COLUMN has_video INTEGER NOT NULL DEFAULT 0 CHECK (has_video IN (0, 1));

CREATE TABLE discovery_roles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_slug TEXT NOT NULL,
  group_name TEXT NOT NULL,
  group_sort_order INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX discovery_roles_active_sort_idx
  ON discovery_roles (is_active, group_sort_order, sort_order, slug);

INSERT INTO discovery_roles (
  slug,
  name,
  group_slug,
  group_name,
  group_sort_order,
  sort_order
)
VALUES
  ('service-planning', '서비스 기획', 'planning', '기획', 1, 1),
  ('pm', 'PM', 'planning', '기획', 1, 2),
  ('ui-ux-design', 'UI·UX 디자인', 'design', '디자인', 2, 1),
  ('graphic-design', '그래픽 디자인', 'design', '디자인', 2, 2),
  ('branding-design', '브랜딩 디자인', 'design', '디자인', 2, 3),
  ('frontend', '프론트엔드', 'development', '개발', 3, 1),
  ('backend', '백엔드', 'development', '개발', 3, 2),
  ('mobile', '모바일', 'development', '개발', 3, 3),
  ('game', '게임', 'development', '개발', 3, 4),
  ('ai-data', 'AI·데이터', 'development', '개발', 3, 5),
  ('video', '영상', 'content', '콘텐츠', 4, 1),
  ('marketing', '마케팅', 'content', '콘텐츠', 4, 2),
  ('content', '콘텐츠', 'content', '콘텐츠', 4, 3),
  ('presentation', '발표', 'operations', '운영', 5, 1),
  ('research', '리서치', 'operations', '운영', 5, 2),
  ('project-operations', '프로젝트 운영', 'operations', '운영', 5, 3);
