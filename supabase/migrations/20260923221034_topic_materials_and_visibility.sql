-- Curriculum content is shared by every class using the curriculum.
-- Existing topic titles and completion records stay unchanged.
alter table public.topics
  add column description text not null default '' check (length(description) <= 500),
  add column pdf_url text check (pdf_url is null or length(pdf_url) <= 2048),
  add column pdf_visible boolean not null default false,
  add constraint topics_visible_pdf_requires_url check (not pdf_visible or pdf_url is not null);
